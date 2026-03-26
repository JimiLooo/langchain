import 'dotenv/config';

import { TavilySearchAPIRetriever } from '@langchain/community/retrievers/tavily_search_api';
import { ProxyAgent } from 'undici';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage, createAgent, initChatModel, tool } from 'langchain';

const apiKey = process.env.API_KEY;
const model = process.env.MODEL;
const baseURL = process.env.BASE_URL;
const temperatureText = process.env.TEMPERATURE;
const threadId = process.env.THREAD_ID;
const proxyUrl = process.env.PROXY_URL;

if (!temperatureText) {
	throw new Error('缺少 TEMPERATURE');
}
const temperature = Number.parseFloat(temperatureText);

if (!apiKey) {
	throw new Error('缺少 API_KEY');
}
if (!model) {
	throw new Error('缺少 MODEL');
}
if (!threadId) {
	throw new Error('缺少 THREAD_ID');
}
if (!proxyUrl) {
	throw new Error('缺少 PROXY_URL');
}

if (!process.env.TAVILY_API_KEY) {
	throw new Error('缺少 TAVILY_API_KEY');
}

const proxyAgent = new ProxyAgent(proxyUrl);
const proxyFetch: typeof globalThis.fetch = (url, init) =>
	fetch(url, { ...init, dispatcher: proxyAgent as any });

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

// Define the tools for the agent to use
const agentTools = [tavilySearchTool];
const agentModel = await initChatModel(model, {
	modelProvider: 'openai',
	apiKey,
	temperature,
	baseURL,
	fetch: proxyFetch
});

// Initialize memory to persist state between graph runs
const agentCheckpointer = new MemorySaver();
const agent = createAgent({
	model: agentModel,
	tools: agentTools,
	checkpointer: agentCheckpointer
});

// Now it's time to use!
const agentFinalState = await agent.invoke(
	{ messages: [new HumanMessage('帮我查一下最近北京去曼谷的机票价格')] },
	{ configurable: { thread_id: threadId } }
);

console.log(agentFinalState.messages[agentFinalState.messages.length - 1].content);

const agentNextState = await agent.invoke(
	{ messages: [new HumanMessage('帮我查一下最近天津去曼谷的机票价格，和北京比哪个便宜')] },
	{ configurable: { thread_id: threadId } }
);

console.log(agentNextState.messages[agentNextState.messages.length - 1].content);
