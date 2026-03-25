const res = await fetch('https://api.x.ai/v1/chat/completions', {
	method: 'POST',
	headers: {
		Authorization: `Bearer ${process.env.API_KEY}`,
		'Content-Type': 'application/json'
	},
	body: JSON.stringify({
		model: 'grok-4-1-fast',
		messages: [{ role: 'user', content: 'hello' }]
	})
});

console.log(await res.json());
