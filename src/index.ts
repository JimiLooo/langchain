import 'dotenv/config';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { HttpsProxyAgent } from 'https-proxy-agent';

function parseNumber(value: string | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

async function main() {
	const rl = readline.createInterface({ input, output });

	const debug = ['1', 'true', 'yes'].includes((process.env.DEBUG ?? '').toLowerCase());
	const temperature = parseNumber(process.env.TEMPERATURE, 0.7);
	const timeoutMs = parseNumber(process.env.TIMEOUT_MS, 60_000);

	const apiKey = process.env.API_KEY;
	const modelName = process.env.MODEL ?? 'grok-4-1-fast';
	const baseURL = process.env.BASE_URL;
	const proxyUrl = 'http://127.0.0.1:7897';

	let llm: ChatOpenAI;

	if (!apiKey) {
		console.error('缺少 API_KEY，请先在 .env 填入。');
		throw new Error('Missing API_KEY');
	}

	if (debug) {
		console.log('[debug] apiKey:', apiKey);
		console.log('[debug] baseURL:', baseURL);
		console.log('[debug] model:', modelName);
		console.log('[debug] temperature:', temperature, 'timeoutMs:', timeoutMs);
	}

	const proxyAgent = new HttpsProxyAgent(proxyUrl);
	const proxyFetch: typeof globalThis.fetch = (url, init) =>
		fetch(url, { ...init, dispatcher: proxyAgent as any });

	llm = new ChatOpenAI({
		apiKey,
		model: modelName,
		temperature,
		timeout: timeoutMs,
		configuration: {
			baseURL,
			fetch: proxyFetch,
		},
	});

	const prompt = ChatPromptTemplate.fromMessages([
		['system', '你是一个简洁、友好且尽量准确的中文聊天助手。'],
		new MessagesPlaceholder('history'),
		['human', '{input}']
	]);

	// LCEL 管道：Prompt -> Model
	const chain = prompt.pipe(llm) as any;

	let history: Array<HumanMessage | AIMessage> = [];

	console.log('简单聊天机器人已启动（输入 /clear 清空历史，/exit 退出）。');

	const ask = (q: string) =>
		new Promise<string>((resolve) => {
			rl.question(q, (answer) => resolve(answer));
		});

	while (true) {
		const userText = (await ask('\n你：')).trim();

		if (!userText) continue;
		if (userText === '/exit') break;
		if (userText === '/clear') {
			history = [];
			console.log('已清空历史。');
			continue;
		}

		try {
			console.log('正在请求模型（可能需要几秒...）');

			// 把历史消息作为上下文一起传给 prompt
			const aiMessage = (await chain.invoke({ input: userText, history })) as AIMessage;
			const content = aiMessage.content ?? String(aiMessage);

			history.push(new HumanMessage(userText));
			history.push(aiMessage);

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
