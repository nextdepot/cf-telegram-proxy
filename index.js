// CONFIG: Constants for the proxy
const BACKEND_URL = "https://your-backend.example.com"; // Change this
const WEBHOOK_PATH = "webhook/telegram-bot"; // Change this

const TELEGRAM_API_BASE = "https://api.telegram.org";

async function handleRequest(request) {
	const url = new URL(request.url);

	// Health check
	if (url.pathname === "/health") {
		return new Response(JSON.stringify({ status: "ok" }), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		});
	}

	// Webhook redirection: POST to /<WEBHOOK_PATH>
	const requestPath = url.pathname.replace(/^\/+/, "");
	const targetWebhookPath = WEBHOOK_PATH.replace(/^\/+/, "");

	if (requestPath === targetWebhookPath && request.method === "POST") {
		try {
			const forwardUrl = `${BACKEND_URL.replace(/\/+$/, "")}/${targetWebhookPath}`;
			const forwardReq = new Request(forwardUrl, {
				method: "POST",
				headers: request.headers,
				body: request.body,
			});
			const response = await fetch(forwardReq);
			return new Response(response.body, response);
		} catch (err) {
			return new Response(`Failed to forward webhook: ${err.message}`, {
				status: 500,
			});
		}
	}

	// Proxy to Telegram API
	// All other requests are forwarded to api.telegram.org
	const telegramUrl = `${TELEGRAM_API_BASE}${url.pathname}${url.search}`;
	const headers = new Headers(request.headers);
	const contentType = headers.get("Content-Type");
	if (
		contentType?.startsWith("application/json") &&
		!contentType.includes("charset")
	) {
		headers.set("Content-Type", "application/json; charset=UTF-8");
	}

	const init = {
		method: request.method,
		headers,
		redirect: "follow",
		body:
			request.method !== "GET" && request.method !== "HEAD"
				? request.body
				: undefined,
	};

	try {
		const tgRes = await fetch(telegramUrl, init);
		const res = new Response(tgRes.body, tgRes);
		const reqAllowHeaders = request.headers.get(
			"Access-Control-Request-Headers",
		);
		const allowHeaders = reqAllowHeaders || "Content-Type";
		res.headers.set("Access-Control-Allow-Origin", "*");
		res.headers.set(
			"Access-Control-Allow-Methods",
			"GET, POST, PUT, DELETE, OPTIONS, HEAD",
		);
		res.headers.set("Access-Control-Allow-Headers", allowHeaders);
		return res;
	} catch (err) {
		return new Response(`Error proxying request: ${err.message}`, {
			status: 500,
		});
	}
}

function handleOptions(request) {
	const reqAllowHeaders = request.headers.get("Access-Control-Request-Headers");
	const allowHeaders = reqAllowHeaders || "Content-Type";

	const corsHeaders = {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD",
		"Access-Control-Allow-Headers": allowHeaders,
		"Access-Control-Max-Age": "86400",
	};

	return new Response(null, {
		status: 204,
		headers: corsHeaders,
	});
}

addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method === "OPTIONS") {
		event.respondWith(handleOptions(request));
	} else {
		event.respondWith(handleRequest(request));
	}
});
