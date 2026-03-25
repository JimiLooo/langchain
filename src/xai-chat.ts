import 'dotenv/config';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
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

	// 默认只使用 Grok/xAI（统一走 OpenAI-compatible 的 Chat 接口）
	const apiKey = process.env.API_KEY;
	const modelName = process.env.MODEL ?? 'grok-4-1-fast';
	const baseURL = process.env.BASE_URL;

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

	llm = new ChatOpenAI({
		apiKey,
		model: modelName,
		temperature,
		timeout: timeoutMs,
		...(baseURL ? { configuration: { baseURL } } : {})
	});

	const response = await llm.invoke([new HumanMessage('你好，介绍一下你自己')]);

	console.log(response.content);
}

main().catch((err) => {
	console.error('程序异常：', err);
	process.exit(1);
});
