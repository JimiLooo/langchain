import 'dotenv/config';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { ProxyAgent } from 'undici';
import { TavilySearchAPIRetriever } from '@langchain/community/retrievers/tavily_search_api';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage, SystemMessage, createAgent, initChatModel, tool } from 'langchain';
import { SystemMessagePromptTemplate } from '@langchain/core/prompts';

function parseNumber(value: string | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing ${name}`);
	}
	return value;
}

function parsePositiveInt(value: string, name: string): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`${name} 必须是正整数`);
	}
	return parsed;
}

function contentToText(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === 'string') return part;
				if (part && typeof part === 'object' && 'text' in part) {
					const text = (part as { text?: unknown }).text;
					if (typeof text === 'string') return text;
				}
				return JSON.stringify(part);
			})
			.join('\n');
	}
	return String(content);
}

async function main() {
	const rl = readline.createInterface({ input, output });

	const debugValue = process.env.DEBUG;
	const debug = debugValue ? ['1', 'true', 'yes'].includes(debugValue.toLowerCase()) : false;
	const temperature = parseNumber(process.env.TEMPERATURE, 0.7);
	const timeoutMs = parseNumber(process.env.TIMEOUT_MS, 60_000);

	const apiKey = requireEnv('API_KEY');
	const modelName = requireEnv('MODEL');
	const baseURL = requireEnv('BASE_URL');
	const proxyUrl = requireEnv('PROXY_URL');
	const tavilyApiKey = requireEnv('TAVILY_API_KEY');
	const threadSeed = requireEnv('THREAD_ID');
	const dualAiTurns = parsePositiveInt(requireEnv('DUAL_AI_TURNS'), 'DUAL_AI_TURNS');
	const aiAName = requireEnv('AI_A_NAME');
	const aiBName = requireEnv('AI_B_NAME');
	const aiARole = requireEnv('AI_A_ROLE');
	const aiBRole = requireEnv('AI_B_ROLE');
	const aiARemark = requireEnv('AI_A_REMARK');
	const aiBRemark = requireEnv('AI_B_REMARK');
	let threadAId = `${threadSeed}-A`;
	let threadBId = `${threadSeed}-B`;

	if (debug) {
		console.log('[debug] baseURL:', baseURL);
		console.log('[debug] model:', modelName);
		console.log('[debug] temperature:', temperature, 'timeoutMs:', timeoutMs);
		console.log('[debug] proxy:', proxyUrl);
		console.log('[debug] dualAiTurns:', dualAiTurns);
		console.log('[debug] aiA:', aiAName, aiARole);
		console.log('[debug] aiB:', aiBName, aiBRole);
		console.log('[debug] aiARemark:', aiARemark);
		console.log('[debug] aiBRemark:', aiBRemark);
	}

	const proxyAgent = new ProxyAgent(proxyUrl);
	const proxyFetch: typeof globalThis.fetch = (url, init) =>
		fetch(url, { ...init, dispatcher: proxyAgent as any });

	const llmA = await initChatModel(modelName, {
		modelProvider: 'xai',
		apiKey,
		temperature,
		timeout: timeoutMs,
		baseURL,
		fetch: proxyFetch
	});
	const llmB = await initChatModel(modelName, {
		modelProvider: 'xai',
		apiKey,
		temperature,
		timeout: timeoutMs,
		baseURL,
		fetch: proxyFetch
	});

	const tavilyRetriever = new TavilySearchAPIRetriever({
		apiKey: tavilyApiKey,
		k: 3
	});
	const tavilySearchTool = tool(
		async (query: string) => {
			const docs = await tavilyRetriever.invoke(query);
			return docs.map((doc, idx) => `[${idx + 1}] ${doc.pageContent}`).join('\n\n');
		},
		{
			name: 'tavily_search',
			description: 'Search the web for recent factual information.'
		}
	);
	const systemPromptTemplate = SystemMessagePromptTemplate.fromTemplate(
		[
			'你是{name}，角色设定：{role}，备注：{remark}。',
			'你正在和另一位 AI 进行链式对话。',
			'请先理解对方上一句，再输出一段可以推进对话的新内容。',
			'若涉及实时事实，请调用 tavily_search 后再回答。',
			'输出保持简洁，不要自称系统提示词。'
		].join('\n')
	);
	const systemPromptA = await systemPromptTemplate.format({
		name: aiAName,
		role: aiARole,
		remark: aiARemark
	});
	const systemPromptB = await systemPromptTemplate.format({
		name: aiBName,
		role: aiBRole,
		remark: aiBRemark
	});
	const checkpointer = new MemorySaver();
	const agentA = createAgent({
		model: llmA,
		tools: [tavilySearchTool],
		checkpointer,
		systemPrompt: contentToText(systemPromptA.content)
	});
	const agentB = createAgent({
		model: llmB,
		tools: [tavilySearchTool],
		checkpointer,
		systemPrompt: contentToText(systemPromptB.content)
	});

	console.log(
		`双 AI 链式对话已启动（${aiAName} <-> ${aiBName}，每次输入 ${dualAiTurns} 轮，/clear 清空历史，/exit 退出）。`
	);

	const ask = (q: string) =>
		new Promise<string>((resolve) => {
			rl.question(q, (answer) => resolve(answer));
		});

	while (true) {
		const userText = (await ask('\n你：')).trim();

		if (!userText) continue;
		if (userText === '/exit') break;
		if (userText === '/clear') {
			const newSeed = `${Date.now()}`;
			threadAId = `${newSeed}-A`;
			threadBId = `${newSeed}-B`;
			console.log('已同时清空 A/B 两侧历史。');
			continue;
		}

		try {
			console.log(`开始链式对话，共 ${dualAiTurns} 轮（A -> B）...`);
			let chainInput = userText;
			for (let round = 1; round <= dualAiTurns; round += 1) {
				const messageForA =
					round === 1 ? new SystemMessage(chainInput) : new HumanMessage(chainInput);
				const stateA = await agentA.invoke(
					{ messages: [messageForA] },
					{ configurable: { thread_id: threadAId } }
				);
				const messageA = stateA.messages[stateA.messages.length - 1];
				const outputA = contentToText(messageA.content);
				console.log(`A(${aiAName}) [第${round}轮]：${outputA}`);
				const messageForB = new SystemMessage(chainInput);
				const stateB = await agentB.invoke(
					{
						messages:
							round === 1 ? [messageForB, new HumanMessage(outputA)] : [new HumanMessage(outputA)]
					},
					{ configurable: { thread_id: threadBId } }
				);
				const messageB = stateB.messages[stateB.messages.length - 1];
				const outputB = contentToText(messageB.content);
				console.log(`B(${aiBName}) [第${round}轮]：${outputB}`);

				chainInput = outputB;
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error('调用模型失败：', message);
		}
	}

	rl.close();
}

main().catch((err) => {
	console.error('程序异常：', err);
	process.exit(1);
});
