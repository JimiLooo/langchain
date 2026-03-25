import { ProxyAgent, fetch } from 'undici';

const proxy = new ProxyAgent('http://127.0.0.1:7897');

const res = await fetch('https://api.x.ai/v1/chat/completions', {
	method: 'POST',
	headers: {
		Authorization: `Bearer ${process.env.API_KEY}`,
		'Content-Type': 'application/json'
	},
	body: JSON.stringify({
		model: 'grok-4-1-fast',
		messages: [{ role: 'user', content: 'hello' }]
	}),
	dispatcher: proxy
});

console.log(JSON.stringify(await res.json(), null, 2));
