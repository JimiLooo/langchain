import 'dotenv/config';

import { TavilySearchAPIRetriever } from '@langchain/community/retrievers/tavily_search_api';
import { tool } from '@langchain/core/tools';
import { ChatOpenAI } from '@langchain/openai';
import { ProxyAgent } from 'undici';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

const apiKey = process.env.API_KEY;
const model = process.env.MODEL;
const baseURL = process.env.BASE_URL;
const temperature = Number.parseFloat(process.env.TEMPERATURE ?? '0');
const threadId = process.env.THREAD_ID ?? '42';
const proxyUrl = 'http://127.0.0.1:7897';

if (!apiKey) {
	throw new Error('缺少 API_KEY');
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
const agentModel = new ChatOpenAI({
	apiKey,
	model,
	temperature,
	configuration: baseURL ? { baseURL, fetch: proxyFetch } : undefined
});

// Initialize memory to persist state between graph runs
const agentCheckpointer = new MemorySaver();
const agent = createReactAgent({
	llm: agentModel,
	tools: agentTools,
	checkpointSaver: agentCheckpointer
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
