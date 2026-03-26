import 'dotenv/config';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { ProxyAgent } from 'undici';
import { TavilySearchAPIRetriever } from '@langchain/community/retrievers/tavily_search_api';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage, createAgent, initChatModel, tool } from 'langchain';

function parseNumber(value: string | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

async function main() {
	const rl = readline.createInterface({ input, output });

	const debugValue = process.env.DEBUG;
	const debug = debugValue ? ['1', 'true', 'yes'].includes(debugValue.toLowerCase()) : false;
	const temperature = parseNumber(process.env.TEMPERATURE, 0.7);
	const timeoutMs = parseNumber(process.env.TIMEOUT_MS, 60_000);

	const apiKey = process.env.API_KEY;
	const modelName = process.env.MODEL;
	const baseURL = process.env.BASE_URL;
	const proxyUrl = process.env.PROXY_URL;
	let threadId = process.env.THREAD_ID;

	if (!apiKey) {
		console.error('缺少 API_KEY，请先在 .env 填入。');
		throw new Error('Missing API_KEY');
	}
	if (!modelName) {
		console.error('缺少 MODEL，请先在 .env 填入。');
		throw new Error('Missing MODEL');
	}
	if (!proxyUrl) {
		console.error('缺少 PROXY_URL，请先在 .env 填入。');
		throw new Error('Missing PROXY_URL');
	}
	if (!threadId) {
		console.error('缺少 THREAD_ID，请先在 .env 填入。');
		throw new Error('Missing THREAD_ID');
	}
	if (!process.env.TAVILY_API_KEY) {
		console.error('缺少 TAVILY_API_KEY，请先在 .env 填入。');
		throw new Error('Missing TAVILY_API_KEY');
	}

	if (debug) {
		console.log('[debug] baseURL:', baseURL);
		console.log('[debug] model:', modelName);
		console.log('[debug] temperature:', temperature, 'timeoutMs:', timeoutMs);
		console.log('[debug] proxy:', proxyUrl);
	}

	const proxyAgent = new ProxyAgent(proxyUrl);
	const proxyFetch: typeof globalThis.fetch = (url, init) =>
		fetch(url, { ...init, dispatcher: proxyAgent as any });

	const llm = await initChatModel(modelName, {
		modelProvider: 'xai',
		apiKey,
		temperature,
		timeout: timeoutMs,
		baseURL,
		fetch: proxyFetch
	});

	const tavilyRetriever = new TavilySearchAPIRetriever({
		apiKey: process.env.TAVILY_API_KEY,
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
	const agent = createAgent({
		model: llm,
		tools: [tavilySearchTool],
		checkpointer: new MemorySaver(),
		systemPrompt: '你现在叫罗丽，是一个大明星，但是喜欢给别人当狗'
	});

	console.log('聊天机器人（已启用 Tavily 搜索）已启动（输入 /clear 清空历史，/exit 退出）。');

	const ask = (q: string) =>
		new Promise<string>((resolve) => {
			rl.question(q, (answer) => resolve(answer));
		});

	while (true) {
		const userText = (await ask('\n你：')).trim();

		if (!userText) continue;
		if (userText === '/exit') break;
		if (userText === '/clear') {
			threadId = `${Date.now()}`;
			console.log('已清空历史。');
			continue;
		}

		try {
			console.log('正在请求模型（可能需要几秒...）');

			const agentState = await agent.invoke(
				{ messages: [new HumanMessage(userText)] },
				{ configurable: { thread_id: threadId } }
			);
			const aiMessage = agentState.messages[agentState.messages.length - 1];
			const content = aiMessage.content ? aiMessage.content : String(aiMessage);

			console.log('助手：', content);
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
