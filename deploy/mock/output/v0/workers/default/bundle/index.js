// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = Symbol();
// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = (arrayBuffer, contentType) => {
	return new Response(arrayBuffer, { headers: { "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase()) } }).formData();
};
// node_modules/hono/dist/utils/body.js
var MAX_NESTED_OBJECTS = 1e4;
var isRawRequest = (request) => "headers" in request;
var parseBody = async (request, options = Object.create(null)) => {
	const { all = false, dot = false } = options;
	const mediaType = (isRawRequest(request) ? request.headers : request.raw.headers).get("Content-Type")?.split(";")[0].trim().toLowerCase();
	if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") return parseFormData(request, {
		all,
		dot
	});
	return {};
};
/**
* Parses form data from a request.
*
* @template T - The type of the parsed body data.
* @param {HonoRequest | Request} request - The request object containing form data.
* @param {ParseBodyOptions} options - Options for parsing the form data.
* @returns {Promise<T>} The parsed body data.
*/
async function parseFormData(request, options) {
	if (!isRawRequest(request) && request.bodyCache.formData) return convertFormDataToBodyData(await request.bodyCache.formData, options);
	const headers = isRawRequest(request) ? request.headers : request.raw.headers;
	const formDataPromise = bufferToFormData(await request.arrayBuffer(), headers.get("Content-Type") || "");
	if (!isRawRequest(request)) request.bodyCache.formData = formDataPromise;
	const formData = await formDataPromise;
	if (formData) return convertFormDataToBodyData(formData, options);
	return {};
}
/**
* Converts form data to body data based on the provided options.
*
* @template T - The type of the parsed body data.
* @param {FormData} formData - The form data to convert.
* @param {ParseBodyOptions} options - Options for parsing the form data.
* @returns {T} The converted body data.
*/
function convertFormDataToBodyData(formData, options) {
	const form = Object.create(null);
	const nestingState = { count: 0 };
	formData.forEach((value, key) => {
		if (!(options.all || key.endsWith("[]"))) form[key] = value;
		else handleParsingAllValues(form, key, value);
	});
	if (options.dot) Object.entries(form).forEach(([key, value]) => {
		if (key.includes(".")) {
			handleParsingNestedValues(form, key, value, nestingState);
			delete form[key];
		}
	});
	return form;
}
/**
* Handles parsing all values for a given key, supporting multiple values as arrays.
*
* @param {BodyData} form - The form data object.
* @param {string} key - The key to parse.
* @param {FormDataEntryValue} value - The value to assign.
*/
var handleParsingAllValues = (form, key, value) => {
	if (form[key] !== void 0) {
		if (Array.isArray(form[key])) form[key].push(value);
		else form[key] = [form[key], value];
	} else if (!key.endsWith("[]")) form[key] = value;
	else form[key] = [value];
};
/**
* Handles parsing nested values using dot notation keys.
*
* @param {BodyData} form - The form data object.
* @param {string} key - The dot notation key.
* @param {BodyDataValue} value - The value to assign.
*/
var handleParsingNestedValues = (form, key, value, state) => {
	if (/(?:^|\.)__proto__\./.test(key)) return;
	let nestedForm = form;
	const keys = key.split(".", 34);
	if (keys.length > 33) throwNestingLimitExceeded();
	keys.forEach((key, index) => {
		if (index === keys.length - 1) nestedForm[key] = value;
		else {
			if (!nestedForm[key] || typeof nestedForm[key] !== "object" || Array.isArray(nestedForm[key]) || nestedForm[key] instanceof File) {
				if (state.count++ >= MAX_NESTED_OBJECTS) throwNestingLimitExceeded();
				nestedForm[key] = Object.create(null);
			}
			nestedForm = nestedForm[key];
		}
	});
};
var throwNestingLimitExceeded = () => {
	throw new Error("Nesting limit exceeded");
};
// node_modules/hono/dist/utils/url.js
var splitPath = (path) => {
	const paths = path.split("/");
	if (paths[0] === "") paths.shift();
	return paths;
};
var splitRoutingPath = (routePath) => {
	const { groups, path } = extractGroupsFromPath(routePath);
	return replaceGroupMarks(splitPath(path), groups);
};
var extractGroupsFromPath = (path) => {
	const groups = [];
	path = path.replace(/\{[^}]+\}/g, (match, index) => {
		const mark = `@${index}`;
		groups.push([mark, match]);
		return mark;
	});
	return {
		groups,
		path
	};
};
var replaceGroupMarks = (paths, groups) => {
	for (let i = groups.length - 1; i >= 0; i--) {
		const [mark] = groups[i];
		for (let j = paths.length - 1; j >= 0; j--) if (paths[j].includes(mark)) {
			paths[j] = paths[j].replace(mark, groups[i][1]);
			break;
		}
	}
	return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
	if (label === "*") return "*";
	const match = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
	if (match) {
		const cacheKey = `${label}#${next}`;
		if (!patternCache[cacheKey]) {
			if (match[2]) patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [
				cacheKey,
				match[1],
				new RegExp(`^${match[2]}(?=/${next})`)
			] : [
				label,
				match[1],
				new RegExp(`^${match[2]}$`)
			];
			else patternCache[cacheKey] = [
				label,
				match[1],
				true
			];
		}
		return patternCache[cacheKey];
	}
	return null;
};
var tryDecode = (str, decoder) => {
	try {
		return decoder(str);
	} catch {
		return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match) => {
			try {
				return decoder(match);
			} catch {
				return match;
			}
		});
	}
};
/**
* Try to apply decodeURI() to given string.
* If it fails, skip invalid percent encoding or invalid UTF-8 sequences, and apply decodeURI() to the rest as much as possible.
* @param str The string to decode.
* @returns The decoded string that sometimes contains undecodable percent encoding.
* @example
* tryDecodeURI('Hello%20World') // 'Hello World'
* tryDecodeURI('Hello%20World/%A4%A2') // 'Hello World/%A4%A2'
*/
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var getPath = (request) => {
	const url = request.url;
	const start = url.indexOf("/", url.indexOf(":") + 4);
	let i = start;
	for (; i < url.length; i++) {
		const charCode = url.charCodeAt(i);
		if (charCode === 37) {
			const queryIndex = url.indexOf("?", i);
			const hashIndex = url.indexOf("#", i);
			const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
			const path = url.slice(start, end);
			return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
		} else if (charCode === 63 || charCode === 35) break;
	}
	return url.slice(start, i);
};
var getPathNoStrict = (request) => {
	const result = getPath(request);
	return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
/**
* Merge paths.
* @param {string[]} ...paths - The paths to merge.
* @returns {string} The merged path.
* @example
* mergePath('/api', '/users') // '/api/users'
* mergePath('/api/', '/users') // '/api/users'
* mergePath('/api', '/') // '/api'
* mergePath('/api/', '/') // '/api/'
*/
var mergePath = (base, sub, ...rest) => {
	if (rest.length) sub = mergePath(sub, ...rest);
	return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path) => {
	if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) return null;
	const segments = path.split("/");
	const results = [];
	let basePath = "";
	segments.forEach((segment) => {
		if (segment !== "" && !/\:/.test(segment)) basePath += "/" + segment;
		else if (/\:/.test(segment)) {
			if (segment.charCodeAt(segment.length - 1) === 63) {
				if (results.length === 0 && basePath === "") results.push("/");
				else results.push(basePath);
				const optionalSegment = segment.slice(0, -1);
				basePath += "/" + optionalSegment;
				results.push(basePath);
			} else basePath += "/" + segment;
		}
	});
	return results.filter((v, i, a) => a.indexOf(v) === i);
};
var tryDecodeURIComponent = (str) => str.indexOf("%") !== -1 ? tryDecode(str, decodeURIComponent_) : str;
var _decodeURI = (value) => {
	if (value.indexOf("+") !== -1) value = value.replace(/\+/g, " ");
	return tryDecodeURIComponent(value);
};
var _getQueryParam = (url, key, multiple) => {
	const hashIndex = url.indexOf("#", 8);
	if (hashIndex !== -1) url = url.slice(0, hashIndex);
	let encoded;
	if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
		let keyIndex = url.indexOf("?", 8);
		if (keyIndex === -1) return;
		if (!url.startsWith(key, keyIndex + 1)) keyIndex = url.indexOf(`&${key}`, keyIndex + 1);
		while (keyIndex !== -1) {
			const trailingKeyCode = url.charCodeAt(keyIndex + key.length + 1);
			if (trailingKeyCode === 61) {
				const valueIndex = keyIndex + key.length + 2;
				const endIndex = url.indexOf("&", valueIndex);
				return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
			} else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) return "";
			keyIndex = url.indexOf(`&${key}`, keyIndex + 1);
		}
		encoded = /[%+]/.test(url);
		if (!encoded) return;
	}
	const results = Object.create(null);
	encoded ??= /[%+]/.test(url);
	let keyIndex = url.indexOf("?", 8);
	while (keyIndex !== -1) {
		const nextKeyIndex = url.indexOf("&", keyIndex + 1);
		let valueIndex = url.indexOf("=", keyIndex);
		if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) valueIndex = -1;
		let name = url.slice(keyIndex + 1, valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex);
		if (encoded) name = _decodeURI(name);
		keyIndex = nextKeyIndex;
		if (name === "") continue;
		let value;
		if (valueIndex === -1) value = "";
		else {
			value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
			if (encoded) value = _decodeURI(value);
		}
		if (multiple) {
			if (!(results[name] && Array.isArray(results[name]))) results[name] = [];
			results[name].push(value);
		} else results[name] ??= value;
	}
	return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
	return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;
// node_modules/hono/dist/request.js
var HonoRequest = class {
	/**
	* `.raw` can get the raw Request object.
	*
	* @see {@link https://hono.dev/docs/api/request#raw}
	*
	* @example
	* ```ts
	* // For Cloudflare Workers
	* app.post('/', async (c) => {
	*   const metadata = c.req.raw.cf?.hostMetadata?
	*   ...
	* })
	* ```
	*/
	raw;
	#validatedData;
	#matchResult;
	routeIndex = 0;
	/**
	* `.path` can get the pathname of the request.
	*
	* @see {@link https://hono.dev/docs/api/request#path}
	*
	* @example
	* ```ts
	* app.get('/about/me', (c) => {
	*   const pathname = c.req.path // `/about/me`
	* })
	* ```
	*/
	path;
	bodyCache = {};
	constructor(request, path = "/", matchResult = [[]]) {
		this.raw = request;
		this.path = path;
		this.#matchResult = matchResult;
	}
	param(key) {
		return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
	}
	#getDecodedParam(key) {
		const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
		const param = this.#getParamValue(paramKey);
		return param && tryDecodeURIComponent(param);
	}
	#getAllDecodedParams() {
		const decoded = {};
		const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
		for (const key of keys) {
			const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
			if (value !== void 0) decoded[key] = tryDecodeURIComponent(value);
		}
		return decoded;
	}
	#getParamValue(paramKey) {
		return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
	}
	query(key) {
		return getQueryParam(this.url, key);
	}
	queries(key) {
		return getQueryParams(this.url, key);
	}
	header(name) {
		if (name) return this.raw.headers.get(name) ?? void 0;
		const headerData = Object.create(null);
		this.raw.headers.forEach((value, key) => {
			headerData[key] = value;
		});
		return headerData;
	}
	async parseBody(options) {
		return parseBody(this, options);
	}
	#cachedBody = (key) => {
		const { bodyCache, raw } = this;
		const cachedBody = bodyCache[key];
		if (cachedBody) return cachedBody;
		for (const anyCachedKey in bodyCache) return bodyCache[anyCachedKey].then((body) => {
			if (anyCachedKey === "json") body = JSON.stringify(body);
			const contentType = anyCachedKey === "formData" ? void 0 : raw.headers.get("content-type");
			return new Response(body, { headers: contentType ? { "Content-Type": contentType } : void 0 })[key]();
		});
		return bodyCache[key] = raw[key]();
	};
	/**
	* `.json()` can parse Request body of type `application/json`
	*
	* @see {@link https://hono.dev/docs/api/request#json}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.json()
	* })
	* ```
	*/
	json() {
		return this.#cachedBody("text").then((text) => JSON.parse(text));
	}
	/**
	* `.text()` can parse Request body of type `text/plain`
	*
	* @see {@link https://hono.dev/docs/api/request#text}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.text()
	* })
	* ```
	*/
	text() {
		return this.#cachedBody("text");
	}
	/**
	* `.arrayBuffer()` parse Request body as an `ArrayBuffer`
	*
	* @see {@link https://hono.dev/docs/api/request#arraybuffer}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.arrayBuffer()
	* })
	* ```
	*/
	arrayBuffer() {
		return this.#cachedBody("arrayBuffer");
	}
	/**
	* `.bytes()` parses the request body as a `Uint8Array`.
	*
	* @see {@link https://hono.dev/docs/api/request#bytes}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.bytes()
	* })
	* ```
	*/
	bytes() {
		return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
	}
	/**
	* Parses the request body as a `Blob`.
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.blob();
	* });
	* ```
	* @see https://hono.dev/docs/api/request#blob
	*/
	blob() {
		return this.#cachedBody("blob");
	}
	/**
	* Parses the request body as `FormData`.
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.formData();
	* });
	* ```
	* @see https://hono.dev/docs/api/request#formdata
	*/
	formData() {
		return this.#cachedBody("formData");
	}
	/**
	* Adds validated data to the request.
	*
	* @param target - The target of the validation.
	* @param data - The validated data to add.
	*/
	addValidatedData(target, data) {
		(this.#validatedData ??= {})[target] = data;
	}
	valid(target) {
		return this.#validatedData?.[target];
	}
	/**
	* `.url` can get the request url strings.
	*
	* @see {@link https://hono.dev/docs/api/request#url}
	*
	* @example
	* ```ts
	* app.get('/about/me', (c) => {
	*   const url = c.req.url // `http://localhost:8787/about/me`
	*   ...
	* })
	* ```
	*/
	get url() {
		return this.raw.url;
	}
	/**
	* `.method` can get the method name of the request.
	*
	* @see {@link https://hono.dev/docs/api/request#method}
	*
	* @example
	* ```ts
	* app.get('/about/me', (c) => {
	*   const method = c.req.method // `GET`
	* })
	* ```
	*/
	get method() {
		return this.raw.method;
	}
	get [GET_MATCH_RESULT]() {
		return this.#matchResult;
	}
	/**
	* `.matchedRoutes` can return a matched route in the handler
	*
	* @deprecated
	*
	* Use matchedRoutes helper defined in "hono/route" instead.
	*
	* @see {@link https://hono.dev/docs/api/request#matchedroutes}
	*
	* @example
	* ```ts
	* app.use('*', async function logger(c, next) {
	*   await next()
	*   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
	*     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
	*     console.log(
	*       method,
	*       ' ',
	*       path,
	*       ' '.repeat(Math.max(10 - path.length, 0)),
	*       name,
	*       i === c.req.routeIndex ? '<- respond from here' : ''
	*     )
	*   })
	* })
	* ```
	*/
	get matchedRoutes() {
		return this.#matchResult[0].map(([[, route]]) => route);
	}
	/**
	* `.routePath` can retrieve the path registered within the handler
	*
	* @deprecated
	*
	* Use routePath helper defined in "hono/route" instead.
	*
	* @see {@link https://hono.dev/docs/api/request#routepath}
	*
	* @example
	* ```ts
	* app.get('/posts/:id', (c) => {
	*   return c.json({ path: c.req.routePath })
	* })
	* ```
	*/
	get routePath() {
		return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
	}
};
// node_modules/hono/dist/utils/html.js
/**
* @module
* HTML utility.
*/
var HtmlEscapedCallbackPhase = {
	Stringify: 1,
	BeforeStream: 2,
	Stream: 3
};
var raw = (value, callbacks) => {
	const escapedString = new String(value);
	escapedString.isEscaped = true;
	escapedString.callbacks = callbacks;
	return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
	if (typeof str === "object" && !(str instanceof String)) {
		if (!(str instanceof Promise)) str = str.toString();
		if (str instanceof Promise) str = await str;
	}
	const callbacks = str.callbacks;
	if (!callbacks?.length) return Promise.resolve(str);
	if (buffer) buffer[0] += str;
	else buffer = [str];
	const resStr = Promise.all(callbacks.map((c) => c({
		phase,
		buffer,
		context
	}))).then((res) => Promise.all(res.filter(Boolean).map((str) => resolveCallback(str, phase, false, context, buffer))).then(() => buffer[0]));
	if (preserveCallbacks) return raw(await resStr, callbacks);
	else return resStr;
};
// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType, headers) => {
	return {
		"Content-Type": contentType,
		...headers
	};
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
	#rawRequest;
	#req;
	/**
	* `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
	*
	* @see {@link https://hono.dev/docs/api/context#env}
	*
	* @example
	* ```ts
	* // Environment object for Cloudflare Workers
	* app.get('*', async c => {
	*   const counter = c.env.COUNTER
	* })
	* ```
	*/
	env = {};
	#var;
	finalized = false;
	/**
	* `.error` can get the error object from the middleware if the Handler throws an error.
	*
	* @see {@link https://hono.dev/docs/api/context#error}
	*
	* @example
	* ```ts
	* app.use('*', async (c, next) => {
	*   await next()
	*   if (c.error) {
	*     // do something...
	*   }
	* })
	* ```
	*/
	error;
	#status;
	#executionCtx;
	#res;
	#layout;
	#renderer;
	#notFoundHandler;
	#preparedHeaders;
	#matchResult;
	#path;
	/**
	* Creates an instance of the Context class.
	*
	* @param req - The Request object.
	* @param options - Optional configuration options for the context.
	*/
	constructor(req, options) {
		this.#rawRequest = req;
		if (options) {
			this.#executionCtx = options.executionCtx;
			this.env = options.env;
			this.#notFoundHandler = options.notFoundHandler;
			this.#path = options.path;
			this.#matchResult = options.matchResult;
		}
	}
	/**
	* `.req` is the instance of {@link HonoRequest}.
	*/
	get req() {
		this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
		return this.#req;
	}
	/**
	* @see {@link https://hono.dev/docs/api/context#event}
	* The FetchEvent associated with the current request.
	*
	* @throws Will throw an error if the context does not have a FetchEvent.
	*/
	get event() {
		if (this.#executionCtx && "respondWith" in this.#executionCtx) return this.#executionCtx;
		else throw Error("This context has no FetchEvent");
	}
	/**
	* @see {@link https://hono.dev/docs/api/context#executionctx}
	* The ExecutionContext associated with the current request.
	*
	* @throws Will throw an error if the context does not have an ExecutionContext.
	*/
	get executionCtx() {
		if (this.#executionCtx) return this.#executionCtx;
		else throw Error("This context has no ExecutionContext");
	}
	/**
	* @see {@link https://hono.dev/docs/api/context#res}
	* The Response object for the current request.
	*/
	get res() {
		return this.#res ||= createResponseInstance(null, { headers: this.#preparedHeaders ??= new Headers() });
	}
	/**
	* Sets the Response object for the current request.
	*
	* @param _res - The Response object to set.
	*/
	set res(_res) {
		if (this.#res && _res) {
			_res = createResponseInstance(_res.body, _res);
			for (const [k, v] of this.#res.headers.entries()) {
				if (k === "content-type") continue;
				if (k === "set-cookie") {
					const cookies = this.#res.headers.getSetCookie();
					_res.headers.delete("set-cookie");
					for (const cookie of cookies) _res.headers.append("set-cookie", cookie);
				} else _res.headers.set(k, v);
			}
		}
		this.#res = _res;
		this.finalized = true;
	}
	/**
	* `.render()` can create a response within a layout.
	*
	* @see {@link https://hono.dev/docs/api/context#render-setrenderer}
	*
	* @example
	* ```ts
	* app.get('/', (c) => {
	*   return c.render('Hello!')
	* })
	* ```
	*/
	render = (...args) => {
		this.#renderer ??= (content) => this.html(content);
		return this.#renderer(...args);
	};
	/**
	* Sets the layout for the response.
	*
	* @param layout - The layout to set.
	* @returns The layout function.
	*/
	setLayout = (layout) => this.#layout = layout;
	/**
	* Gets the current layout for the response.
	*
	* @returns The current layout function.
	*/
	getLayout = () => this.#layout;
	/**
	* `.setRenderer()` can set the layout in the custom middleware.
	*
	* @see {@link https://hono.dev/docs/api/context#render-setrenderer}
	*
	* @example
	* ```tsx
	* app.use('*', async (c, next) => {
	*   c.setRenderer((content) => {
	*     return c.html(
	*       <html>
	*         <body>
	*           <p>{content}</p>
	*         </body>
	*       </html>
	*     )
	*   })
	*   await next()
	* })
	* ```
	*/
	setRenderer = (renderer) => {
		this.#renderer = renderer;
	};
	/**
	* `.header()` can set headers.
	*
	* @see {@link https://hono.dev/docs/api/context#header}
	*
	* @example
	* ```ts
	* app.get('/welcome', (c) => {
	*   // Set headers
	*   c.header('X-Message', 'Hello!')
	*   c.header('Content-Type', 'text/plain')
	*
	*   // Append multiple headers using the append option (e.g. Vary)
	*   c.header('Vary', 'Accept-Encoding', { append: true })
	*   c.header('Vary', 'User-Agent', { append: true })
	*
	*   return c.body('Thank you for coming')
	* })
	* ```
	*/
	header = (name, value, options) => {
		if (this.finalized) this.#res = createResponseInstance(this.#res.body, this.#res);
		const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
		if (value === void 0) headers.delete(name);
		else if (options?.append) headers.append(name, value);
		else headers.set(name, value);
	};
	status = (status) => {
		this.#status = status;
	};
	/**
	* `.set()` can set the value specified by the key.
	*
	* @see {@link https://hono.dev/docs/api/context#set-get}
	*
	* @example
	* ```ts
	* app.use('*', async (c, next) => {
	*   c.set('message', 'Hono is hot!!')
	*   await next()
	* })
	* ```
	*/
	set = (key, value) => {
		this.#var ??= /* @__PURE__ */ new Map();
		this.#var.set(key, value);
	};
	/**
	* `.get()` can use the value specified by the key.
	*
	* @see {@link https://hono.dev/docs/api/context#set-get}
	*
	* @example
	* ```ts
	* app.get('/', (c) => {
	*   const message = c.get('message')
	*   return c.text(`The message is "${message}"`)
	* })
	* ```
	*/
	get = (key) => {
		return this.#var ? this.#var.get(key) : void 0;
	};
	/**
	* `.var` can access the value of a variable.
	*
	* @see {@link https://hono.dev/docs/api/context#var}
	*
	* @example
	* ```ts
	* const result = c.var.client.oneMethod()
	* ```
	*/
	get var() {
		if (!this.#var) return {};
		return Object.fromEntries(this.#var);
	}
	#newResponse(data, arg, headers) {
		let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
		if (typeof arg === "object" && arg.headers) {
			responseHeaders ??= new Headers();
			for (const [key, value] of new Headers(arg.headers)) if (key === "set-cookie") responseHeaders.append(key, value);
			else responseHeaders.set(key, value);
		}
		if (headers) {
			if (!responseHeaders) {
				let count = 0;
				for (const k in headers) if (++count > 1 || typeof headers[k] !== "string") {
					responseHeaders = new Headers();
					break;
				}
			}
			if (responseHeaders) for (const k in headers) {
				const v = headers[k];
				if (typeof v === "string") responseHeaders.set(k, v);
				else {
					responseHeaders.delete(k);
					for (const v2 of v) responseHeaders.append(k, v2);
				}
			}
		}
		return createResponseInstance(data, {
			status: typeof arg === "number" ? arg : arg?.status ?? this.#status,
			headers: responseHeaders ?? headers
		});
	}
	newResponse = (...args) => this.#newResponse(...args);
	/**
	* `.body()` can return the HTTP response.
	* You can set headers with `.header()` and set HTTP status code with `.status`.
	* This can also be set in `.text()`, `.json()` and so on.
	*
	* @see {@link https://hono.dev/docs/api/context#body}
	*
	* @example
	* ```ts
	* app.get('/welcome', (c) => {
	*   // Set headers
	*   c.header('X-Message', 'Hello!')
	*   c.header('Content-Type', 'text/plain')
	*   // Set HTTP status code
	*   c.status(201)
	*
	*   // Return the response body
	*   return c.body('Thank you for coming')
	* })
	* ```
	*/
	body = (data, arg, headers) => this.#newResponse(data, arg, headers);
	/**
	* `.text()` can render text as `Content-Type:text/plain`.
	*
	* @see {@link https://hono.dev/docs/api/context#text}
	*
	* @example
	* ```ts
	* app.get('/say', (c) => {
	*   return c.text('Hello!')
	* })
	* ```
	*/
	text = (text, arg, headers) => {
		return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(text, arg, setDefaultContentType(TEXT_PLAIN, headers));
	};
	/**
	* `.json()` can render JSON as `Content-Type:application/json`.
	*
	* @see {@link https://hono.dev/docs/api/context#json}
	*
	* @example
	* ```ts
	* app.get('/api', (c) => {
	*   return c.json({ message: 'Hello!' })
	* })
	* ```
	*/
	json = (object, arg, headers) => {
		return this.#newResponse(JSON.stringify(object), arg, setDefaultContentType("application/json", headers));
	};
	html = (html, arg, headers) => {
		const res = (html) => this.#newResponse(html, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
		return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
	};
	/**
	* `.redirect()` can Redirect, default status code is 302.
	*
	* @see {@link https://hono.dev/docs/api/context#redirect}
	*
	* @example
	* ```ts
	* app.get('/redirect', (c) => {
	*   return c.redirect('/')
	* })
	* app.get('/redirect-permanently', (c) => {
	*   return c.redirect('/', 301)
	* })
	* ```
	*/
	redirect = (location, status) => {
		const locationString = String(location);
		this.header("Location", !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString));
		return this.newResponse(null, status ?? 302);
	};
	/**
	* `.notFound()` can return the Not Found Response.
	*
	* @see {@link https://hono.dev/docs/api/context#notfound}
	*
	* @example
	* ```ts
	* app.get('/notfound', (c) => {
	*   return c.notFound()
	* })
	* ```
	*/
	notFound = () => {
		this.#notFoundHandler ??= () => createResponseInstance();
		return this.#notFoundHandler(this);
	};
};
// node_modules/hono/dist/compose.js
/**
* Compose middleware functions into a single function based on `koa-compose` package.
*
* @template E - The environment type.
*
* @param {[[Function, unknown], unknown][] | [[Function]][]} middleware - An array of middleware functions and their corresponding parameters.
* @param {ErrorHandler<E>} [onError] - An optional error handler function.
* @param {NotFoundHandler<E>} [onNotFound] - An optional not-found handler function.
*
* @returns {(context: Context, next?: Next) => Promise<Context>} - A composed middleware function.
*/
var compose = (middleware, onError, onNotFound) => {
	return (context, next) => {
		let index = -1;
		return dispatch(0);
		/**
		* Dispatch the middleware functions.
		*
		* @param {number} i - The current index in the middleware array.
		*
		* @returns {Promise<Context>} - A promise that resolves to the context.
		*/
		async function dispatch(i) {
			if (i <= index) throw new Error("next() called multiple times");
			index = i;
			let res;
			let isError = false;
			let handler;
			if (middleware[i]) {
				handler = middleware[i][0][0];
				context.req.routeIndex = i;
			} else handler = i === middleware.length && next || void 0;
			if (handler) try {
				res = await handler(context, () => dispatch(i + 1));
			} catch (err) {
				if (err instanceof Error && onError) {
					context.error = err;
					res = await onError(err, context);
					isError = true;
				} else throw err;
			}
			else if (context.finalized === false && onNotFound) res = await onNotFound(context);
			if (res && (context.finalized === false || isError)) context.res = res;
			return context;
		}
	};
};
// node_modules/hono/dist/router.js
/**
* Array of supported HTTP methods.
*/
var METHODS = [
	"get",
	"post",
	"put",
	"delete",
	"options",
	"patch",
	"query"
];
/**
* Error message indicating that a route cannot be added because the matcher is already built.
*/
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
/**
* Error class representing an unsupported path error.
*/
var UnsupportedPathError = class extends Error {};
// node_modules/hono/dist/utils/constants.js
/**
* Constant used to mark a composed handler.
*/
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";
// node_modules/hono/dist/hono-base.js
/**
* @module
* This module is the base module for the Hono object.
*/
var notFoundHandler = (c) => {
	return c.text("404 Not Found", 404);
};
var errorHandler = (err, c) => {
	if ("getResponse" in err) {
		const res = err.getResponse();
		return c.newResponse(res.body, res);
	}
	console.error(err);
	return c.text("Internal Server Error", 500);
};
var Hono$1 = class Hono {
	get;
	post;
	put;
	delete;
	options;
	patch;
	query;
	all;
	on;
	use;
	router;
	getPath;
	_basePath = "/";
	#path = "/";
	routes = [];
	constructor(options = {}) {
		[...METHODS, "all"].forEach((method) => {
			this[method] = (args1, ...args) => {
				const methodName = method.toUpperCase();
				if (typeof args1 === "string") this.#path = args1;
				else this.#addRoute(methodName, this.#path, args1);
				args.forEach((handler) => {
					this.#addRoute(methodName, this.#path, handler);
				});
				return this;
			};
		});
		this.on = (method, path, ...handlers) => {
			for (const p of [path].flat()) {
				this.#path = p;
				for (const m of [method].flat()) {
					const methodName = m.toUpperCase();
					for (const handler of handlers) this.#addRoute(methodName, this.#path, handler);
				}
			}
			return this;
		};
		this.use = (arg1, ...handlers) => {
			if (typeof arg1 === "string") this.#path = arg1;
			else {
				this.#path = "*";
				handlers.unshift(arg1);
			}
			handlers.forEach((handler) => {
				this.#addRoute("ALL", this.#path, handler);
			});
			return this;
		};
		const { strict, ...optionsWithoutStrict } = options;
		Object.assign(this, optionsWithoutStrict);
		this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
	}
	#clone() {
		const clone = new Hono({
			router: this.router,
			getPath: this.getPath
		});
		clone.errorHandler = this.errorHandler;
		clone.#notFoundHandler = this.#notFoundHandler;
		clone.routes = this.routes;
		return clone;
	}
	#notFoundHandler = notFoundHandler;
	errorHandler = errorHandler;
	/**
	* `.route()` allows grouping other Hono instance in routes.
	*
	* @see {@link https://hono.dev/docs/api/routing#grouping}
	*
	* @param {string} path - base Path
	* @param {Hono} app - other Hono instance
	* @returns {Hono} routed Hono instance
	*
	* @example
	* ```ts
	* const app = new Hono()
	* const app2 = new Hono()
	*
	* app2.get("/user", (c) => c.text("user"))
	* app.route("/api", app2) // GET /api/user
	* ```
	*/
	route(path, app) {
		const subApp = this.basePath(path);
		app.routes.map((r) => {
			let handler;
			if (app.errorHandler === errorHandler) handler = r.handler;
			else {
				handler = async (c, next) => (await compose([], app.errorHandler)(c, () => r.handler(c, next))).res;
				handler[COMPOSED_HANDLER] = r.handler;
			}
			subApp.#addRoute(r.method, r.path, handler, r.basePath);
		});
		return this;
	}
	/**
	* `.basePath()` allows base paths to be specified.
	*
	* @see {@link https://hono.dev/docs/api/routing#base-path}
	*
	* @param {string} path - base Path
	* @returns {Hono} changed Hono instance
	*
	* @example
	* ```ts
	* const api = new Hono().basePath('/api')
	* ```
	*/
	basePath(path) {
		const subApp = this.#clone();
		subApp._basePath = mergePath(this._basePath, path);
		return subApp;
	}
	/**
	* `.onError()` handles an error and returns a customized Response.
	*
	* @see {@link https://hono.dev/docs/api/hono#error-handling}
	*
	* @param {ErrorHandler} handler - request Handler for error
	* @returns {Hono} changed Hono instance
	*
	* @example
	* ```ts
	* app.onError((err, c) => {
	*   console.error(`${err}`)
	*   return c.text('Custom Error Message', 500)
	* })
	* ```
	*/
	onError = (handler) => {
		this.errorHandler = handler;
		return this;
	};
	/**
	* `.notFound()` allows you to customize a Not Found Response.
	*
	* @see {@link https://hono.dev/docs/api/hono#not-found}
	*
	* @param {NotFoundHandler} handler - request handler for not-found
	* @returns {Hono} changed Hono instance
	*
	* @example
	* ```ts
	* app.notFound((c) => {
	*   return c.text('Custom 404 Message', 404)
	* })
	* ```
	*/
	notFound = (handler) => {
		this.#notFoundHandler = handler;
		return this;
	};
	/**
	* `.mount()` allows you to mount applications built with other frameworks into your Hono application.
	*
	* @deprecated Use `mount()` from `hono/mount` instead. `.mount()` will be removed in v5.
	*
	* @see {@link https://hono.dev/docs/api/hono#mount}
	*
	* @param {string} path - base Path
	* @param {Function} applicationHandler - other Request Handler
	* @param {MountOptions} [options] - options of `.mount()`
	* @returns {Hono} mounted Hono instance
	*
	* @example
	* ```ts
	* import { Router as IttyRouter } from 'itty-router'
	* import { Hono } from 'hono'
	* // Create itty-router application
	* const ittyRouter = IttyRouter()
	* // GET /itty-router/hello
	* ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
	*
	* const app = new Hono()
	* app.mount('/itty-router', ittyRouter.handle)
	* ```
	*
	* @example
	* ```ts
	* const app = new Hono()
	* // Send the request to another application without modification.
	* app.mount('/app', anotherApp, {
	*   replaceRequest: (req) => req,
	* })
	* ```
	*/
	mount(path, applicationHandler, options) {
		let replaceRequest;
		let optionHandler;
		if (options) {
			if (typeof options === "function") optionHandler = options;
			else {
				optionHandler = options.optionHandler;
				if (options.replaceRequest === false) replaceRequest = (request) => request;
				else replaceRequest = options.replaceRequest;
			}
		}
		const getOptions = optionHandler ? (c) => {
			const options = optionHandler(c);
			return Array.isArray(options) ? options : [options];
		} : (c) => {
			let executionContext = void 0;
			try {
				executionContext = c.executionCtx;
			} catch {}
			return [c.env, executionContext];
		};
		replaceRequest ||= (() => {
			const mergedPath = mergePath(this._basePath, path);
			const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
			return (request) => {
				const url = new URL(request.url);
				url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
				return new Request(url, request);
			};
		})();
		const handler = async (c, next) => {
			const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
			if (res) return res;
			await next();
		};
		this.#addRoute("ALL", mergePath(path, "*"), handler);
		return this;
	}
	#addRoute(method, path, handler, baseRoutePath) {
		path = mergePath(this._basePath, path);
		const r = {
			basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
			path,
			method,
			handler
		};
		this.router.add(method, path, [handler, r]);
		this.routes.push(r);
	}
	#handleError(err, c) {
		if (err instanceof Error) return this.errorHandler(err, c);
		throw err;
	}
	#dispatch(request, executionCtx, env, method) {
		if (method === "HEAD") return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
		const path = this.getPath(request, { env });
		const matchResult = this.router.match(method, path);
		const c = new Context(request, {
			path,
			matchResult,
			env,
			executionCtx,
			notFoundHandler: this.#notFoundHandler
		});
		if (matchResult[0].length === 1) {
			let res;
			try {
				res = matchResult[0][0][0][0](c, async () => {
					c.res = await this.#notFoundHandler(c);
				});
			} catch (err) {
				return this.#handleError(err, c);
			}
			return res instanceof Promise ? res.then((resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
		}
		const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
		return (async () => {
			try {
				const context = await composed(c);
				if (!context.finalized) throw new Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");
				return context.res;
			} catch (err) {
				return this.#handleError(err, c);
			}
		})();
	}
	/**
	* `.fetch()` will be entry point of your app.
	*
	* @see {@link https://hono.dev/docs/api/hono#fetch}
	*
	* @param {Request} request - request Object of request
	* @param {Env} env - env Object
	* @param {ExecutionContext} executionCtx - context of execution
	* @returns {Response | Promise<Response>} response of request
	*
	*/
	fetch = (request, ...rest) => {
		return this.#dispatch(request, rest[1], rest[0], request.method);
	};
	/**
	* `.request()` is a useful method for testing.
	* You can pass a URL or pathname to send a GET request.
	* app will return a Response object.
	* ```ts
	* test('GET /hello is ok', async () => {
	*   const res = await app.request('/hello')
	*   expect(res.status).toBe(200)
	* })
	* ```
	* @see https://hono.dev/docs/api/hono#request
	*/
	request = (input, requestInit, Env, executionCtx) => {
		if (input instanceof Request) return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
		input = input.toString();
		return this.fetch(new Request(/^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`, requestInit), Env, executionCtx);
	};
	/**
	* `.fire()` automatically adds a global fetch event listener.
	* This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
	* @deprecated
	* Use `fire` from `hono/service-worker` instead.
	* ```ts
	* import { Hono } from 'hono'
	* import { fire } from 'hono/service-worker'
	*
	* const app = new Hono()
	* // ...
	* fire(app)
	* ```
	* @see https://hono.dev/docs/api/hono#fire
	* @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
	* @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
	*/
	fire = () => {
		addEventListener("fetch", (event) => {
			event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
		});
	};
};
// node_modules/hono/dist/router/utils.js
var createNullObject = () => Object.create(null);
// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
	const matchers = this.buildAllMatchers();
	const match = ((method, path) => {
		const matcher = matchers[method] || matchers["ALL"];
		const staticMatch = matcher[2][path];
		if (staticMatch) return staticMatch;
		const match = path.match(matcher[0]);
		if (!match) return [[], emptyParam];
		const index = match.indexOf("", 1);
		return [matcher[1][index], match];
	});
	this.match = match;
	return match(method, path);
}
// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = Symbol();
var regExpMetaChars = /* @__PURE__ */ new Set(".\\+*[^]$()");
/**
* Sort order:
* 1. literal
* 2. special pattern (e.g. :label{[0-9]+})
* 3. common label pattern (e.g. :label)
* 4. wildcard
*/
function compareKey(a, b) {
	if (a.length === 1) return b.length === 1 ? a < b ? -1 : 1 : -1;
	if (b.length === 1) return 1;
	if (a === ".*" || a === "(?:|/.*)") return b === "(?:|/.*)" ? -1 : 1;
	else if (b === ".*" || b === "(?:|/.*)") return -1;
	if (a === "[^/]+") return 1;
	else if (b === "[^/]+") return -1;
	return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var Node$1 = class Node {
	#index;
	#varIndex;
	#children = createNullObject();
	insert(tokens, index, paramMap, context, isStatic) {
		let node = this;
		for (let i = 0, len = tokens.length; i < len; i++) {
			const token = tokens[i];
			const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? [
				"",
				"",
				".*"
			] : [
				"",
				"",
				LABEL_REG_EXP_STR
			] : null : token === "/*" ? [
				"",
				"",
				TAIL_WILDCARD_REG_EXP_STR
			] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
			let nextNode;
			if (pattern) {
				const name = pattern[1];
				let regexpStr = pattern[2] || "[^/]+";
				if (name && pattern[2]) {
					if (regexpStr === ".*") throw PATH_ERROR;
					regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
					if (/\((?!\?:)/.test(regexpStr)) throw PATH_ERROR;
					if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) throw PATH_ERROR;
				}
				nextNode = node.#children[regexpStr];
				if (!nextNode) {
					if (regexpStr !== ".*" && regexpStr !== "(?:|/.*)") {
						for (const k in node.#children) if ((regexpStr.length > 1 || k.length > 1) && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
					}
					nextNode = node.#children[regexpStr] = new Node();
				}
				if (name !== "") {
					nextNode.#varIndex ??= context.varIndex++;
					paramMap.push([name, nextNode.#varIndex]);
				}
			} else {
				nextNode = node.#children[token];
				if (!nextNode) {
					for (const k in node.#children) if (k.length > 1 && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
					nextNode = node.#children[token] = new Node();
				}
			}
			node = nextNode;
		}
		if (node.#index !== void 0) throw PATH_ERROR;
		node.#index = isStatic ? -1 : index;
	}
	buildRegExpStr() {
		const strList = Object.keys(this.#children).sort(compareKey).map((k) => {
			const c = this.#children[k];
			const childStr = c.buildRegExpStr();
			return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
		}).filter(Boolean);
		if (typeof this.#index === "number" && this.#index !== -1) strList.unshift(`#${this.#index}`);
		if (strList.length === 0) return "";
		if (strList.length === 1) return strList[0];
		return "(?:" + strList.join("|") + ")";
	}
};
// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
	#context = { varIndex: 0 };
	#root = new Node$1();
	#index = 0;
	paths = createNullObject();
	insert(path, isStatic) {
		if (isStatic) {
			this.#root.insert(path.split(""), 0, [], this.#context, true);
			return;
		}
		const paramAssoc = [];
		const groups = [];
		let markedPath = path;
		for (let i = 0;;) {
			let replaced = false;
			markedPath = markedPath.replace(/\{[^}]+\}/g, (m) => {
				const mark = `@\\${i}`;
				groups[i] = [mark, m];
				i++;
				replaced = true;
				return mark;
			});
			if (!replaced) break;
		}
		/**
		*  - pattern (:label, :label{0-9]+}, ...)
		*  - /* wildcard
		*  - character
		*/
		const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
		for (let i = groups.length - 1; i >= 0; i--) {
			const [mark] = groups[i];
			for (let j = tokens.length - 1; j >= 0; j--) if (tokens[j].indexOf(mark) !== -1) {
				tokens[j] = tokens[j].replace(mark, groups[i][1]);
				break;
			}
		}
		this.#root.insert(tokens, this.#index, paramAssoc, this.#context, false);
		this.paths[path] = [this.#index++, paramAssoc];
	}
	buildRegExp() {
		let regexp = this.#root.buildRegExpStr();
		if (regexp === "") return [
			/^$/,
			[],
			[]
		];
		let captureIndex = 0;
		const indexReplacementMap = [];
		const paramReplacementMap = [];
		regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
			if (handlerIndex !== void 0) {
				indexReplacementMap[++captureIndex] = Number(handlerIndex);
				return "$()";
			}
			if (paramIndex !== void 0) {
				paramReplacementMap[Number(paramIndex)] = ++captureIndex;
				return "";
			}
			return "";
		});
		return [
			new RegExp(`^${regexp}`),
			indexReplacementMap,
			paramReplacementMap
		];
	}
};
// node_modules/hono/dist/router/reg-exp-router/router.js
var wildcardRegExpCache = createNullObject();
function buildWildcardRegExp(path) {
	return wildcardRegExpCache[path] ??= new RegExp(`^${path.replace(/\/:[^/{}]+(?:\{\[\^\/]\+})?(?=[/{]|$)|\/?\*$|([.\\+*[^\]$()?{}|])/g, (match, metaChar) => metaChar ? `\\${metaChar}` : match === "/*" ? TAIL_WILDCARD_REG_EXP_STR : match === "*" ? ".*" : `/:${LABEL_REG_EXP_STR}`)}$`);
}
function findMiddleware(middleware, path) {
	for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) if (buildWildcardRegExp(k).test(path)) return [...middleware[k]];
}
var RegExpRouter = class {
	name = "RegExpRouter";
	#middleware;
	#routes;
	#tries;
	constructor() {
		this.#middleware = { ["ALL"]: createNullObject() };
		this.#routes = { ["ALL"]: createNullObject() };
		this.#tries = { ["ALL"]: new Trie() };
	}
	#insertPath(method, path) {
		try {
			this.#tries[method].insert(path, !/\*|\/:/.test(path));
		} catch (e) {
			throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
		}
	}
	add(method, path, handler) {
		const middleware = this.#middleware;
		const routes = this.#routes;
		if (!middleware) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
		if (!middleware[method]) {
			this.#tries[method] = new Trie();
			for (const handlerMap of [middleware, routes]) {
				handlerMap[method] = createNullObject();
				for (const p in handlerMap["ALL"]) {
					handlerMap[method][p] = [...handlerMap["ALL"][p]];
					this.#insertPath(method, p);
				}
			}
		}
		if (path === "/*") path = "*";
		const methods = method === "ALL" ? Object.keys(middleware) : [method];
		if (/\*$/.test(path)) {
			const re = buildWildcardRegExp(path);
			for (const m of methods) if (!middleware[m][path]) {
				this.#insertPath(m, path);
				middleware[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware["ALL"], path) || [];
			}
			for (const handlerMap of [middleware, routes]) for (const m of methods) for (const p in handlerMap[m]) re.test(p) && handlerMap[m][p].push([handler, path]);
			return;
		}
		const paths = checkOptionalParameter(path) || [path];
		for (const path of paths) for (const m of methods) {
			if (!routes[m][path]) {
				this.#insertPath(m, path);
				routes[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware["ALL"], path) || [];
			}
			routes[m][path].push([handler, path]);
		}
	}
	match = match;
	buildAllMatchers() {
		const matchers = createNullObject();
		for (const method of Object.keys(this.#routes)) matchers[method] = this.#buildMatcher(method);
		this.#middleware = this.#routes = this.#tries = void 0;
		wildcardRegExpCache = createNullObject();
		return matchers;
	}
	#buildMatcher(method) {
		const middleware = this.#middleware[method];
		const routes = this.#routes[method];
		const trie = this.#tries[method];
		const staticMap = createNullObject();
		const handlerData = [];
		const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
		for (const r of [middleware, routes]) for (const path in r) {
			const handlers = r[path];
			const pathData = trie.paths[path];
			if (!pathData) {
				staticMap[path] = [handlers.map(([h]) => [h, createNullObject()]), emptyParam];
				continue;
			}
			handlerData[pathData[0]] = handlers.map(([h, handlerPath]) => [h, trie.paths[handlerPath][1].reduceRight((map, [key], i) => {
				map[key] = paramReplacementMap[pathData[1][i][1]];
				return map;
			}, createNullObject())]);
		}
		return [
			regexp,
			indexReplacementMap.map((i) => handlerData[i]),
			staticMap
		];
	}
};
// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
	name = "SmartRouter";
	#routers = [];
	#routes = [];
	constructor(init) {
		this.#routers = init.routers;
	}
	add(method, path, handler) {
		if (!this.#routes) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
		this.#routes.push([
			method,
			path,
			handler
		]);
	}
	match(method, path) {
		if (!this.#routes) throw new Error("Fatal error");
		const routers = this.#routers;
		const routes = this.#routes;
		const len = routers.length;
		let i = 0;
		let res;
		for (; i < len; i++) {
			const router = routers[i];
			try {
				for (let i = 0, len = routes.length; i < len; i++) router.add(...routes[i]);
				res = router.match(method, path);
			} catch (e) {
				if (e instanceof UnsupportedPathError) continue;
				throw e;
			}
			this.match = router.match.bind(router);
			this.#routers = [router];
			this.#routes = void 0;
			break;
		}
		if (i === len) throw new Error("Fatal error");
		this.name = `SmartRouter + ${this.activeRouter.name}`;
		return res;
	}
	get activeRouter() {
		if (this.#routes || this.#routers.length !== 1) throw new Error("No active router has been determined yet.");
		return this.#routers[0];
	}
};
// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = createNullObject();
var order = 0;
var Node = class Node {
	#methods = [];
	#children = createNullObject();
	#patterns = [];
	#pattern;
	#params = emptyParams;
	insert(method, path, handler) {
		let curNode = this;
		const parts = splitRoutingPath(path);
		const possibleKeys = /* @__PURE__ */ new Set();
		let i = 0;
		for (const p of parts) {
			const nextP = parts[++i];
			const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
			const isParam = Array.isArray(pattern);
			const key = isParam ? pattern[0] : pattern || p;
			const child = curNode.#children[key] ||= new Node();
			if (pattern && !child.#pattern) {
				child.#pattern = pattern;
				curNode.#patterns.push(child);
			}
			curNode = child;
			if (isParam) possibleKeys.add(pattern[1]);
		}
		curNode.#methods.push({ [method]: {
			handler,
			possibleKeys: [...possibleKeys],
			score: ++order
		} });
	}
	#pushHandlerSets(handlerSets, node, method, nodeParams, params) {
		for (let i = 0, len = node.#methods.length; i < len; i++) {
			const m = node.#methods[i];
			const handlerSet = m[method] || m["ALL"];
			if (handlerSet) {
				handlerSet.params = createNullObject();
				handlerSets.push(handlerSet);
				for (let i = 0, len = handlerSet.possibleKeys.length; i < len; i++) {
					const key = handlerSet.possibleKeys[i];
					handlerSet.params[key] = params?.[key] && !i ? params[key] : nodeParams[key] ?? params?.[key];
				}
			}
		}
	}
	search(method, path) {
		const handlerSets = [];
		this.#params = emptyParams;
		let curNodes = [this];
		const parts = splitPath(path);
		const curNodesQueue = [];
		const len = parts.length;
		let partOffsets = null;
		for (let i = 0; i < len; i++) {
			const part = parts[i];
			const isLast = i === len - 1;
			const tempNodes = [];
			for (let j = 0, len2 = curNodes.length; j < len2; j++) {
				const node = curNodes[j];
				const nextNode = node.#children[part];
				if (nextNode) {
					nextNode.#params = node.#params;
					if (isLast) {
						if (nextNode.#children["*"]) this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
						this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
					} else tempNodes.push(nextNode);
				}
				for (const child of node.#patterns) {
					const pattern = child.#pattern;
					const params = node.#params === emptyParams ? {} : { ...node.#params };
					if (typeof pattern === "string") {
						if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
							this.#pushHandlerSets(handlerSets, child, method, node.#params);
							if (pattern === "*") {
								child.#params = params;
								tempNodes.push(child);
							}
						}
						continue;
					}
					const [, name, matcher] = pattern;
					if (!part && matcher === true) continue;
					if (matcher !== true) {
						if (!partOffsets) {
							partOffsets = [];
							let offset = path[0] === "/" ? 1 : 0;
							for (let p = 0; p < len; p++) {
								partOffsets[p] = offset;
								offset += parts[p].length + 1;
							}
						}
						const restPathString = path.slice(partOffsets[i]);
						const m = matcher.exec(restPathString);
						if (m) {
							params[name] = m[0];
							this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
							if (m[0].length === restPathString.length && child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, node.#params, params);
							for (const _ in child.#children) {
								child.#params = params;
								const componentCount = m[0].match(/\//g)?.length ?? 0;
								(curNodesQueue[componentCount] ||= []).push(child);
								break;
							}
							continue;
						}
					}
					if (matcher === true || matcher.test(part)) {
						params[name] = part;
						if (isLast) {
							this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
							if (child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, params, node.#params);
						} else {
							child.#params = params;
							tempNodes.push(child);
						}
					}
				}
			}
			const shifted = curNodesQueue.shift();
			curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
		}
		if (handlerSets[1]) handlerSets.sort((a, b) => {
			return a.score - b.score;
		});
		return [handlerSets.map(({ handler, params }) => [handler, params])];
	}
};
// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
	name = "TrieRouter";
	#node = new Node();
	add(method, path, handler) {
		for (const result of checkOptionalParameter(path) || [path]) this.#node.insert(method, result, handler);
	}
	match(method, path) {
		return this.#node.search(method, path);
	}
};
// node_modules/hono/dist/hono.js
/**
* The Hono class extends the functionality of the HonoBase class.
* It sets up routing and allows for custom options to be passed.
*
* @template E - The environment type.
* @template S - The schema type.
* @template BasePath - The base path type.
*/
var Hono = class extends Hono$1 {
	/**
	* Creates an instance of the Hono class.
	*
	* @param options - Optional configuration options for the Hono instance.
	*/
	constructor(options = {}) {
		super(options);
		this.router = options.router ?? new SmartRouter({ routers: [new RegExpRouter(), new TrieRouter()] });
	}
};
// src/shared/dates.ts
/** Date helpers on YYYY-MM-DD strings, all in UTC. Launch weeks start on Monday. */
var DAY_MS = 864e5;
function isoDay(date) {
	return date.toISOString().slice(0, 10);
}
var dayMs = (day) => Date.parse(`${day}T00:00:00Z`);
function addDays(day, days) {
	const d = /* @__PURE__ */ new Date(`${day}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return isoDay(d);
}
/** Whole days from `from` to `to` (negative when `to` is earlier). */
var daysBetween = (from, to) => Math.round((dayMs(to) - dayMs(from)) / DAY_MS);
/** The Monday that starts the week holding `day`. */
function mondayOf(day) {
	const dow = (/* @__PURE__ */ new Date(`${day}T00:00:00Z`)).getUTCDay();
	return addDays(day, dow === 0 ? -6 : 1 - dow);
}
/** `count` consecutive Mondays starting with the week holding `from`. */
function listMondays(from, count) {
	const first = mondayOf(from);
	return Array.from({ length: count }, (_, i) => addDays(first, i * 7));
}
/** Days of the inclusive range [start, end] that fall in the week starting `monday`. */
function overlapDays(start, end, monday) {
	const from = Math.max(dayMs(start), dayMs(monday));
	const to = Math.min(dayMs(end), dayMs(addDays(monday, 6)));
	return to < from ? 0 : Math.round((to - from) / DAY_MS) + 1;
}
// src/shared/knowledge.gen.ts
var KNOWLEDGE = {
	"cases": [
		{
			"id": "kr-apple-iphone-air-pinch",
			"market": "KR",
			"stage": "creative",
			"date": "2025-09",
			"brand": "Apple",
			"title": "iPhone Air 韩国版广告删掉了\"捏手势\"",
			"summary": "iPhone Air 全球广告用拇指和食指捏住机身来展示\"薄\"，只有韩国版把手指去掉。韩国媒体普遍认为这是为了提前规避\"집게손（捏手手势）厌男\"争议。",
			"lesson": "同一套 KV，在韩国要单独出一版；大公司会主动做\"预防性本地化\"。",
			"sources": [
				"https://www.chosun.com/economy/tech_it/2025/09/12/G6UHMVLDRREBPFMTCONW5LBARA/",
				"https://news.nate.com/view/20250911n28219",
				"https://www.insight.co.kr/news/519817"
			],
			"verified": true
		},
		{
			"id": "kr-gs25-pinch-2021",
			"market": "KR",
			"stage": "creative",
			"date": "2021-05-01",
			"brand": "GS25",
			"title": "GS25 露营促销海报\"捏香肠的手\"引发抵制",
			"summary": "海报里捏着香肠的手被指像已关闭的激进女权网站 Megalia 的 logo。 GS25 当天道歉、两次改图后撤下海报，后来处分了设计师，GS Retail 社长被降职。这是\"捏手势\"争议在韩国大范围扩散的起点。",
			"lesson": "在韩国，\"手指捏/指向物品\"的画面会被逐帧放大审视。",
			"sources": ["https://ko.wikipedia.org/wiki/집게손가락_음모론"],
			"verified": true
		},
		{
			"id": "kr-nexon-maplestory-2023",
			"market": "KR",
			"stage": "creative",
			"date": "2023-11-25",
			"brand": "Nexon（外包 Studio Ppuri）",
			"title": "冒险岛宣传动画中 0.1 秒的手势引发风波",
			"summary": "网友指控宣传动画里有一帧\"捏手势\"，Nexon 要求外包工作室道歉。媒体后来调查发现，那一帧是一位 40 多岁男性动画师画的，指控缺乏依据；但 2024 年 8 月警方驳回工作室起诉时，仍称\"商业广告回避捏手势是惯例\"。",
			"lesson": "争议本身是否成立是另一回事，商业上的风险是真实的。知识库要中立描述，不替任何一方下结论，只提示\"这会引发争议\"。",
			"sources": ["https://ko.wikipedia.org/wiki/집게손가락_음모론", "https://ko.wikipedia.org/wiki/스튜디오_뿌리"],
			"verified": true
		},
		{
			"id": "kr-halloween-itaewon",
			"market": "KR",
			"stage": "timing",
			"date": "2022-10-29（此后每年 10 月）",
			"brand": "韩国零售与咖啡连锁业",
			"title": "梨泰院事故后，韩国零售业连续 4 年不做万圣节营销",
			"summary": "2022 年 10 月 29 日首尔梨泰院踩踏事故后，零售和咖啡连锁品牌普遍停掉万圣节限定菜单和促销，到 2026 年已是第 4 年，营销力量转向 11 月的 Pepero Day 和高考季。",
			"lesson": "10 月底在韩国做\"万圣节狂欢\"主题，属于高风险档期。",
			"sources": ["https://news.tf.co.kr/read/economy/2382191.htm", "https://www.newsworker.co.kr/news/articleView.html?idxno=511047"],
			"verified": true
		},
		{
			"id": "kr-lee-luda-2021",
			"market": "KR",
			"stage": "trust",
			"date": "2020-12-23 ~ 2021-01-11",
			"brand": "Scatter Lab（AI 聊天机器人\"이루다\"）",
			"title": "AI 聊天机器人上线 3 周即下线",
			"summary": "以\"20 多岁女大学生\"为人设的聊天机器人，因歧视性言论和训练数据中的个人信息问题，上线约 3 周后停止服务，之后被韩国个人信息保护委员会处以合计约 1 亿韩元的罚款。",
			"lesson": "AI 产品在韩国上线，人设、训练数据来源和隐私说明都会被严格审视。",
			"sources": ["https://ko.wikipedia.org/wiki/이루다_(인공지능)", "https://www.aitimes.kr/news/articleView.html?idxno=20883"],
			"verified": true
		},
		{
			"id": "kr-deepseek-pipc-2025",
			"market": "KR",
			"stage": "trust",
			"date": "2025-02",
			"brand": "DeepSeek",
			"title": "韩国暂停 DeepSeek 新下载",
			"summary": "韩国个人信息保护委员会（PIPC）发现 DeepSeek 把用户数据传给字节跳动，2025 年 2 月暂停其在韩新下载； 4 月又公布其未经同意向中国传输了 100 多万名韩国用户的信息。",
			"lesson": "中国 AI 产品进韩国，\"数据存在哪、传给谁\"是第一道关。上线物料里要主动说明数据驻留、隐私政策（韩文）和本地代表。",
			"sources": ["https://www.reuters.com/technology/south-koreas-data-protection-authority-suspends-local-service-deepseek-2025-02-17/", "https://en.wikipedia.org/wiki/DeepSeek_(AI)"],
			"verified": true
		},
		{
			"id": "kr-ai-basic-act",
			"market": "KR",
			"stage": "trust",
			"date": "2024-12 通过",
			"brand": "（法规）",
			"title": "韩国《人工智能基本法》",
			"summary": "2024 年 12 月通过，要求开发和部署生成式 AI 的企业承担安全和透明义务（含风险评估、生成内容标识等）。",
			"lesson": "面向韩国的 AI 产品宣发，要说明 AI 生成内容如何标识。",
			"sources": ["https://en.wikipedia.org/wiki/Regulation_of_artificial_intelligence"],
			"verified": "partial"
		},
		{
			"id": "us-apple-crush-2024",
			"market": "US",
			"stage": "creative",
			"date": "2024-05",
			"brand": "Apple",
			"title": "iPad Pro \"Crush!\" 广告道歉",
			"summary": "液压机把乐器、颜料、书本压扁，最后\"压\"成一台 iPad。广告被批评为\"碾碎人类创造力\"， Apple 公开道歉，并取消了电视投放计划。三星随后推出反讽广告 \"UnCrush\"。",
			"lesson": "科技/AI 产品在美国宣传时，\"取代人类创作\"的意象非常容易翻车。",
			"sources": ["https://www.macworld.com/article/2328732/apple-apologizes-for-ipad-pro-crush-ad-and-scraps-tv-plans.html", "https://adage.com/article/digital-marketing-ad-tech-news/apple-apologizes-ipad-pro-crushed-ad-it-missed-mark/2559321/"],
			"verified": true
		},
		{
			"id": "us-gemini-dear-sydney-2024",
			"market": "US",
			"stage": "creative",
			"date": "2024-07/08",
			"brand": "Google Gemini",
			"title": "\"Dear Sydney\" 奥运广告被撤",
			"summary": "父亲让 Gemini 替女儿给偶像运动员写信。广告被批评\"用 AI 取代真实的人类表达\"， Google 在奥运期间撤下了这支广告。",
			"lesson": "别让 AI 替用户做\"本该亲自做的情感表达\"。",
			"sources": ["https://en.wikipedia.org/wiki/Google_Gemini", "https://awfulannouncing.com/advertising/google-dear-sydney-ad-olympics-nbc-gemini-ai.html"],
			"verified": true
		},
		{
			"id": "us-artisan-stop-hiring-humans",
			"market": "US",
			"stage": "claims",
			"date": "2024-2026",
			"brand": "Artisan（AI 销售 agent 初创公司）",
			"title": "\"Stop Hiring Humans\" 广告牌引发反弹后退役",
			"summary": "旧金山、纽约时代广场等地的挑衅式广告牌带来大量曝光，同时引发强烈反弹，公司之后宣布不再使用这条口号。",
			"lesson": "\"取代人类员工\"的叙事能换来流量，但品牌代价很高。对中国 AI 公司来说，再叠加\"外国公司抢美国人饭碗\"的联想，风险更大。",
			"sources": ["https://www.artisan.co/blog/stop-hiring-humans", "https://www.sfchronicle.com/bayarea/article/artisan-stop-hiring-humans-billboards-22426145.php"],
			"verified": true
		},
		{
			"id": "us-ftc-ai-comply-2024",
			"market": "US",
			"stage": "claims",
			"date": "2024-09-25",
			"brand": "DoNotPay 等",
			"title": "FTC \"Operation AI Comply\" 打击夸大 AI 宣称",
			"summary": "FTC 集中处理一批夸大 AI 能力的案件，其中 DoNotPay 自称\"世界第一个机器人律师\"， 2025 年 2 月和解令生效，禁止其做无依据的 AI 能力宣传。",
			"lesson": "\"100% 准确\"\"替代律师/医生\"这类宣称，在美国需要证据支撑。",
			"sources": ["https://www.ftc.gov/news-events/news/press-releases/2024/09/ftc-announces-crackdown-deceptive-ai-claims-schemes"],
			"verified": true
		},
		{
			"id": "us-ftc-fake-reviews-2024",
			"market": "US",
			"stage": "claims",
			"date": "2024-08",
			"brand": "（法规）",
			"title": "FTC 禁止 AI 生成的虚假评价",
			"summary": "FTC 规则禁止营销方使用由生成式 AI 编造的用户评价或推荐语。",
			"lesson": "落地页和应用商店素材里不要放 AI 编写的\"用户好评\"。",
			"sources": ["https://en.wikipedia.org/wiki/ChatGPT"],
			"verified": "partial"
		},
		{
			"id": "sg-epay-brownface-2019",
			"market": "SG",
			"stage": "creative",
			"date": "2019-07/08",
			"brand": "NETS E-Pay（演员 Dennis Chew）",
			"title": "电子支付广告\"棕脸\"风波",
			"summary": "华人演员 Dennis Chew 在同一支广告里化妆扮演马来人、印度人等多个族群角色，被批评为\"brownface\"。演员和相关方公开道歉。",
			"lesson": "新加坡是多元种族社会，选角和妆造必须真实代表各族群，不能\"一人扮多族\"。",
			"sources": ["https://www.straitstimes.com/singapore/actor-and-dj-dennis-chew-apologises-for-e-pay-brownface-advertisement", "https://www.channelnewsasia.com/singapore/brownface-controversy-actor-dennis-chew-says-hes-deeply-sorry-role-in-e-payment-ad-5701776"],
			"verified": true
		},
		{
			"id": "sg-hungry-ghost-launch-lull",
			"market": "SG",
			"stage": "timing",
			"date": "每年农历七月（约公历 8 月）",
			"brand": "新加坡房地产开发商",
			"title": "鬼月期间开发商刻意避开新盘发布",
			"summary": "农历七月被部分华人视为不宜做大决定的月份，开发商普遍推迟新盘发布，当月新房销量明显下滑。",
			"lesson": "面向华人消费者的重大发布要避开鬼月；B2B 和面向年轻群体的产品影响较小。",
			"sources": ["https://sg.propnex.com/news-details/13301/developers-sales-fell-in-august-amid-muted-launch-activity-during-hungry-ghost-month", "https://www.99.co/singapore/insider/august-developer-sales-slow-amid-launch-lull-and-hungry-ghost-month/"],
			"verified": true
		}
	],
	"rules": [
		{
			"id": "KR-G01",
			"market": "KR",
			"stage": "creative",
			"category": "手势",
			"severity": "high",
			"detect": "vision",
			"looks_for": "拇指和食指做\"捏/夹\"的手势，尤其是捏着或指向产品、物品",
			"signals": ["gesture.pinch"],
			"why": "自 2021 年起被部分网络社区视为\"厌男\"符号，多家企业因此道歉撤稿；争议本身是否成立另当别论，但商业广告回避该手势已成惯例",
			"fix": "改成手掌托举、平放在桌面，或只展示产品本身（Apple iPhone Air 韩国版就是这样处理的）",
			"cases": [
				"kr-apple-iphone-air-pinch",
				"kr-gs25-pinch-2021",
				"kr-nexon-maplestory-2023"
			],
			"verified": true
		},
		{
			"id": "KR-T01",
			"market": "KR",
			"stage": "timing",
			"category": "敏感档期",
			"severity": "high",
			"detect": "date",
			"looks_for": "10 月下旬至 10-31，\"万圣节/狂欢/派对\"主题的活动或素材",
			"signals": ["theme.halloween", "theme.festive"],
			"why": "2022-10-29 梨泰院事故后，韩国零售业已连续 4 年停止万圣节营销",
			"fix": "避开万圣节主题；把档期移到 11 月（Pepero Day、高考结束后）",
			"cases": ["kr-halloween-itaewon"],
			"verified": true
		},
		{
			"id": "KR-T02",
			"market": "KR",
			"stage": "timing",
			"category": "全民事件",
			"severity": "medium",
			"detect": "date",
			"looks_for": "高考日（每年 11 月第三个星期四）当天发布，或做喧闹的线下活动",
			"signals": ["theme.festive"],
			"why": "全国考生、家长高度关注；当天的营销音量和噪音都会被视为不合时宜",
			"fix": "避开当天；针对学生的产品可以在考后做\"考完了\"主题",
			"cases": [],
			"verified": "partial"
		},
		{
			"id": "KR-T03",
			"market": "KR",
			"stage": "timing",
			"category": "纪念日",
			"severity": "medium",
			"detect": "date",
			"looks_for": "4-16（世越号）、6-6（显忠日）前后的轻浮、狂欢基调素材",
			"signals": ["theme.festive"],
			"why": "全国性哀悼和纪念日，娱乐化基调容易被批评",
			"fix": "这些日期前后的素材改用克制基调，或顺延发布",
			"cases": [],
			"verified": false
		},
		{
			"id": "KR-C01",
			"market": "KR",
			"stage": "creative",
			"category": "历史与领土",
			"severity": "high",
			"detect": "vision",
			"looks_for": "旭日旗及类似放射状图案；地图上独岛/东海的标注；日本殖民时期相关意象",
			"signals": ["symbol.rising_sun", "map.disputed_label"],
			"why": "涉及韩日历史问题，属于韩国社会的红线",
			"fix": "去掉放射状日章图案；地图用\"독도/동해\"标注，或干脆不放地图",
			"cases": [],
			"verified": false
		},
		{
			"id": "KR-C02",
			"market": "KR",
			"stage": "creative",
			"category": "颜色与书写",
			"severity": "low",
			"detect": "vision",
			"looks_for": "用红色写活人的名字（例如在海报上用红字写代言人名字）",
			"signals": ["text.red_person_name"],
			"why": "传统上红笔写名字与死亡相关",
			"fix": "人名改用其他颜色",
			"cases": [],
			"verified": false
		},
		{
			"id": "KR-D01",
			"market": "KR",
			"stage": "trust",
			"category": "数据与隐私",
			"severity": "high",
			"detect": "page",
			"looks_for": "落地页或隐私政策没有韩文版，没写明数据存储地、跨境传输对象、本地代表",
			"signals": ["privacy.no_local_policy", "privacy.no_data_residency"],
			"why": "韩国 PIPC 曾因数据传往中国暂停 DeepSeek 新下载；AI 聊天机器人 이루다 也因隐私问题被罚",
			"fix": "提供韩文隐私政策，写明数据驻留地区、第三方共享清单和韩国本地联系人；在宣发物料里主动说明",
			"cases": ["kr-deepseek-pipc-2025", "kr-lee-luda-2021"],
			"verified": true
		},
		{
			"id": "KR-D02",
			"market": "KR",
			"stage": "trust",
			"category": "AI 透明度",
			"severity": "medium",
			"detect": "page",
			"looks_for": "生成式 AI 产品没有说明如何标识 AI 生成内容",
			"signals": ["ai.no_disclosure"],
			"why": "韩国《人工智能基本法》对生成式 AI 有透明度义务",
			"fix": "在产品说明和宣发页写明 AI 生成内容的标识方式",
			"cases": ["kr-ai-basic-act"],
			"verified": "partial"
		},
		{
			"id": "US-M01",
			"market": "US",
			"stage": "claims",
			"category": "AI 叙事",
			"severity": "high",
			"detect": "text",
			"looks_for": "\"取代人类\"\"不用再雇人\"\"碾碎/淘汰创作者\"等意象或口号",
			"signals": ["claim.replace_humans", "claim.crush_creativity"],
			"why": "Apple Crush、Gemini \"Dear Sydney\"、Artisan \"Stop Hiring Humans\" 都因此遭遇强烈反弹",
			"fix": "改成\"增强/赋能\"叙事，例如\"把时间还给你的团队\"；把人放在画面中心",
			"cases": [
				"us-apple-crush-2024",
				"us-gemini-dear-sydney-2024",
				"us-artisan-stop-hiring-humans"
			],
			"verified": true
		},
		{
			"id": "US-M02",
			"market": "US",
			"stage": "claims",
			"category": "情感替代",
			"severity": "medium",
			"detect": "text",
			"looks_for": "AI 代替用户完成亲密或情感表达（替孩子写信、替你道歉、替你写婚礼誓词）",
			"signals": ["claim.emotional_ghostwriting"],
			"why": "\"Dear Sydney\" 被撤的核心原因",
			"fix": "让 AI 做辅助，比如提供灵感、检查语法，而不是代笔情感内容",
			"cases": ["us-gemini-dear-sydney-2024"],
			"verified": true
		},
		{
			"id": "US-L01",
			"market": "US",
			"stage": "claims",
			"category": "能力宣称",
			"severity": "high",
			"detect": "text",
			"looks_for": "\"100% 准确\"\"从不出错\"\"替代律师/医生/会计\"等没有证据的 AI 能力宣称",
			"signals": ["claim.absolute_accuracy", "claim.replace_professional"],
			"why": "FTC \"Operation AI Comply\" 专门打击这类宣称，DoNotPay 已被处罚",
			"fix": "用可验证的数据替代绝对化表述，并注明测试条件",
			"cases": ["us-ftc-ai-comply-2024"],
			"verified": true
		},
		{
			"id": "US-L02",
			"market": "US",
			"stage": "claims",
			"category": "虚假评价",
			"severity": "high",
			"detect": "page",
			"looks_for": "AI 生成的用户好评、虚构的推荐人或 logo 墙",
			"signals": ["claim.ai_testimonial"],
			"why": "FTC 规则明确禁止",
			"fix": "只使用真实用户评价，并保留授权记录",
			"cases": ["us-ftc-fake-reviews-2024"],
			"verified": "partial"
		},
		{
			"id": "US-T01",
			"market": "US",
			"stage": "timing",
			"category": "纪念日",
			"severity": "medium",
			"detect": "date",
			"looks_for": "9-11 当天发布，或做促销、轻松基调的营销",
			"signals": ["theme.festive"],
			"why": "全国纪念日，蹭热度或促销会被视为不敬",
			"fix": "当天暂停营销推送",
			"cases": [],
			"verified": false
		},
		{
			"id": "SG-R01",
			"market": "SG",
			"stage": "creative",
			"category": "种族表现",
			"severity": "high",
			"detect": "vision",
			"looks_for": "一人化妆扮演多个族群；刻意加深或改变肤色；族群刻板印象（口音、服饰）",
			"signals": ["people.one_actor_many_races", "people.altered_skin_tone"],
			"why": "NETS E-Pay \"brownface\" 广告引发全国性批评并道歉",
			"fix": "由对应族群的演员出演；多族群画面要真实、平衡",
			"cases": ["sg-epay-brownface-2019"],
			"verified": true
		},
		{
			"id": "SG-R02",
			"market": "SG",
			"stage": "creative",
			"category": "宗教与饮食",
			"severity": "medium",
			"detect": "vision",
			"looks_for": "面向全体或马来穆斯林受众的素材里出现猪肉、酒精；宗教符号用作装饰",
			"signals": [
				"food.pork",
				"food.alcohol",
				"religion.decorative_symbol"
			],
			"why": "新加坡多宗教共处，宗教和谐受法律保护（Maintenance of Religious Harmony Act）",
			"fix": "面向全体受众的素材避免猪肉和酒精元素；宗教元素只在节庆祝福等恰当语境出现",
			"cases": [],
			"verified": false
		},
		{
			"id": "SG-T01",
			"market": "SG",
			"stage": "timing",
			"category": "华人习俗",
			"severity": "medium",
			"detect": "date",
			"looks_for": "农历七月（鬼月，约公历 8 月）做面向华人消费者的重大发布",
			"signals": [],
			"why": "开发商普遍避开鬼月发布新盘，当月销量明显下滑",
			"fix": "消费类发布移到鬼月前后；B2B 产品影响较小",
			"cases": ["sg-hungry-ghost-launch-lull"],
			"verified": true
		},
		{
			"id": "SG-C01",
			"market": "SG",
			"stage": "creative",
			"category": "国家象征",
			"severity": "medium",
			"detect": "vision",
			"looks_for": "商业广告里使用新加坡国旗、国徽、国歌",
			"signals": ["symbol.national_flag"],
			"why": "新加坡对国家象征的商业使用有法规限制",
			"fix": "国庆主题用红白配色和城市地标，不直接使用国旗国徽",
			"cases": [],
			"verified": false
		}
	],
	"calendar": [
		{
			"id": "sg-sff-2026",
			"market": "SG",
			"name": "新加坡金融科技节",
			"kind": "rival",
			"start": "2026-11-16",
			"end": "2026-11-20",
			"attention": .5,
			"audience": {
				"enterprise": .9,
				"developer": .6,
				"all": .2
			},
			"confidence": "estimated",
			"note": "往年在 11 月中；对 B2B AI 产品既是撞档也是机会",
			"rules": [],
			"blocks": []
		},
		{
			"id": "kr-csat-2026",
			"market": "KR",
			"name": "高考日",
			"kind": "sensitive",
			"start": "2026-11-19",
			"end": "2026-11-19",
			"attention": .8,
			"audience": {
				"student": 1,
				"consumer": .6,
				"all": .4
			},
			"confidence": "rule",
			"note": "每年 11 月第三个星期四",
			"rules": ["KR-T02"],
			"blocks": ["theme.festive"]
		},
		{
			"id": "us-thanksgiving-2026",
			"market": "US",
			"name": "感恩节",
			"kind": "holiday",
			"start": "2026-11-26",
			"end": "2026-11-26",
			"attention": .85,
			"audience": { "all": .85 },
			"confidence": "confirmed",
			"rules": [],
			"blocks": []
		},
		{
			"id": "us-bfcm-2026",
			"market": "US",
			"name": "黑五到网一",
			"kind": "rival",
			"start": "2026-11-27",
			"end": "2026-11-30",
			"attention": .9,
			"audience": {
				"consumer": .95,
				"prosumer": .8,
				"enterprise": .3,
				"all": .6
			},
			"confidence": "rule",
			"note": "广告位贵、信息过载",
			"rules": [],
			"blocks": []
		},
		{
			"id": "us-reinvent-2026",
			"market": "US",
			"name": "AWS re:Invent",
			"kind": "rival",
			"start": "2026-11-30",
			"end": "2026-12-04",
			"attention": .6,
			"audience": {
				"developer": .9,
				"enterprise": .9,
				"all": .2
			},
			"confidence": "estimated",
			"note": "往年在 12 月第一周",
			"rules": [],
			"blocks": []
		},
		{
			"id": "us-holiday-freeze-2026",
			"market": "US",
			"name": "年底假期",
			"kind": "holiday",
			"start": "2026-12-21",
			"end": "2027-01-01",
			"attention": .8,
			"audience": {
				"enterprise": .95,
				"developer": .7,
				"consumer": .6,
				"all": .7
			},
			"confidence": "rule",
			"note": "企业决策基本停摆",
			"rules": [],
			"blocks": []
		},
		{
			"id": "kr-xmas-2026",
			"market": "KR",
			"name": "圣诞节",
			"kind": "holiday",
			"start": "2026-12-24",
			"end": "2026-12-25",
			"attention": .5,
			"audience": { "all": .5 },
			"confidence": "confirmed",
			"rules": [],
			"blocks": []
		},
		{
			"id": "sg-xmas-2026",
			"market": "SG",
			"name": "圣诞到元旦",
			"kind": "holiday",
			"start": "2026-12-24",
			"end": "2027-01-01",
			"attention": .6,
			"audience": { "all": .6 },
			"confidence": "rule",
			"rules": [],
			"blocks": []
		},
		{
			"id": "kr-newyear-2027",
			"market": "KR",
			"name": "元旦",
			"kind": "holiday",
			"start": "2026-12-31",
			"end": "2027-01-01",
			"attention": .6,
			"audience": { "all": .6 },
			"confidence": "confirmed",
			"rules": [],
			"blocks": []
		},
		{
			"id": "us-ces-2027",
			"market": "US",
			"name": "CES",
			"kind": "rival",
			"start": "2027-01-05",
			"end": "2027-01-09",
			"attention": .8,
			"audience": {
				"consumer": .8,
				"prosumer": .9,
				"developer": .5,
				"all": .4
			},
			"confidence": "estimated",
			"note": "往年在 1 月第一周",
			"rules": [],
			"blocks": []
		},
		{
			"id": "kr-unpacked-early-2027",
			"market": "KR",
			"name": "三星 Galaxy Unpacked",
			"kind": "rival",
			"start": "2027-01-20",
			"end": "2027-02-28",
			"attention": .7,
			"audience": {
				"consumer": .8,
				"prosumer": .8,
				"developer": .5,
				"all": .4
			},
			"confidence": "estimated",
			"note": "S 系列发布，往年在 1-2 月，具体日期待官宣；窗口较宽所以只取中等影响",
			"rules": [],
			"blocks": []
		},
		{
			"id": "sg-cny-2027",
			"market": "SG",
			"name": "农历新年",
			"kind": "holiday",
			"start": "2027-02-05",
			"end": "2027-02-08",
			"attention": .95,
			"audience": { "all": .9 },
			"confidence": "confirmed",
			"note": "2/8 补休；前后一周注意力都在拜年和团聚",
			"rules": [],
			"blocks": []
		},
		{
			"id": "kr-seollal-2027",
			"market": "KR",
			"name": "설날 春节",
			"kind": "holiday",
			"start": "2027-02-06",
			"end": "2027-02-09",
			"attention": .95,
			"audience": { "all": .95 },
			"confidence": "confirmed",
			"note": "2/7 是周日，2/9 补休",
			"rules": [],
			"blocks": []
		},
		{
			"id": "sg-ramadan-2027",
			"market": "SG",
			"name": "斋月",
			"kind": "sensitive",
			"start": "2027-02-08",
			"end": "2027-03-09",
			"attention": .4,
			"audience": { "all": .3 },
			"confidence": "estimated",
			"note": "按开斋节 3/10 倒推；白天的饮食类素材要注意",
			"rules": ["SG-R02"],
			"blocks": ["food.pork", "food.alcohol"]
		},
		{
			"id": "us-superbowl-2027",
			"market": "US",
			"name": "超级碗 LXI",
			"kind": "rival",
			"start": "2027-02-14",
			"end": "2027-02-14",
			"attention": .9,
			"audience": {
				"consumer": .9,
				"all": .7
			},
			"confidence": "estimated",
			"note": "AI 公司近年常在此投广告",
			"rules": [],
			"blocks": []
		},
		{
			"id": "kr-march1-2027",
			"market": "KR",
			"name": "三一节",
			"kind": "sensitive",
			"start": "2027-03-01",
			"end": "2027-03-01",
			"attention": .5,
			"audience": { "all": .5 },
			"confidence": "confirmed",
			"note": "当天避免日本相关意象",
			"rules": ["KR-C01"],
			"blocks": ["theme.japan", "symbol.rising_sun"]
		},
		{
			"id": "kr-semester-2027",
			"market": "KR",
			"name": "新学期开学",
			"kind": "opportunity",
			"start": "2027-03-02",
			"end": "2027-03-15",
			"attention": .4,
			"audience": { "student": .9 },
			"confidence": "rule",
			"note": "学习类 AI 工具的窗口",
			"rules": [],
			"blocks": []
		},
		{
			"id": "sg-hari-raya-puasa-2027",
			"market": "SG",
			"name": "开斋节",
			"kind": "holiday",
			"start": "2027-03-10",
			"end": "2027-03-10",
			"attention": .6,
			"audience": { "all": .5 },
			"confidence": "confirmed",
			"rules": [],
			"blocks": []
		},
		{
			"id": "us-gtc-2027",
			"market": "US",
			"name": "NVIDIA GTC",
			"kind": "rival",
			"start": "2027-03-15",
			"end": "2027-03-19",
			"attention": .6,
			"audience": {
				"developer": .9,
				"enterprise": .7,
				"all": .2
			},
			"confidence": "estimated",
			"note": "往年在 3 月中",
			"rules": [],
			"blocks": []
		},
		{
			"id": "sg-good-friday-2027",
			"market": "SG",
			"name": "耶稣受难日",
			"kind": "holiday",
			"start": "2027-03-26",
			"end": "2027-03-26",
			"attention": .3,
			"audience": { "all": .3 },
			"confidence": "confirmed",
			"rules": [],
			"blocks": []
		},
		{
			"id": "kr-sewol-2027",
			"market": "KR",
			"name": "世越号纪念日",
			"kind": "sensitive",
			"start": "2027-04-16",
			"end": "2027-04-16",
			"attention": .5,
			"audience": { "all": .5 },
			"confidence": "rule",
			"rules": ["KR-T03"],
			"blocks": ["theme.festive"]
		},
		{
			"id": "kr-may-holidays-2027",
			"market": "KR",
			"name": "劳动节+儿童节",
			"kind": "holiday",
			"start": "2027-05-01",
			"end": "2027-05-05",
			"attention": .6,
			"audience": { "all": .6 },
			"confidence": "confirmed",
			"note": "5/3 补休",
			"rules": [],
			"blocks": []
		},
		{
			"id": "us-io-build-2027",
			"market": "US",
			"name": "Google I/O + Microsoft Build",
			"kind": "rival",
			"start": "2027-05-10",
			"end": "2027-05-21",
			"attention": .8,
			"audience": {
				"developer": .95,
				"prosumer": .7,
				"enterprise": .6,
				"all": .3
			},
			"confidence": "estimated",
			"note": "往年在 5 月",
			"rules": [],
			"blocks": []
		},
		{
			"id": "kr-buddha-2027",
			"market": "KR",
			"name": "佛诞日",
			"kind": "holiday",
			"start": "2027-05-13",
			"end": "2027-05-13",
			"attention": .4,
			"audience": { "all": .4 },
			"confidence": "confirmed",
			"rules": [],
			"blocks": []
		},
		{
			"id": "sg-raya-haji-vesak-2027",
			"market": "SG",
			"name": "哈芝节+卫塞节",
			"kind": "holiday",
			"start": "2027-05-17",
			"end": "2027-05-20",
			"attention": .4,
			"audience": { "all": .4 },
			"confidence": "confirmed",
			"rules": [],
			"blocks": []
		},
		{
			"id": "sg-atxsg-2027",
			"market": "SG",
			"name": "Asia Tech x Singapore",
			"kind": "rival",
			"start": "2027-05-25",
			"end": "2027-05-29",
			"attention": .4,
			"audience": {
				"enterprise": .8,
				"developer": .6,
				"all": .2
			},
			"confidence": "estimated",
			"note": "往年在 5 月底",
			"rules": [],
			"blocks": []
		},
		{
			"id": "us-memorial-2027",
			"market": "US",
			"name": "阵亡将士纪念日",
			"kind": "holiday",
			"start": "2027-05-31",
			"end": "2027-05-31",
			"attention": .5,
			"audience": { "all": .5 },
			"confidence": "confirmed",
			"rules": [],
			"blocks": []
		},
		{
			"id": "kr-memorial-2027",
			"market": "KR",
			"name": "显忠日",
			"kind": "sensitive",
			"start": "2027-06-06",
			"end": "2027-06-06",
			"attention": .5,
			"audience": { "all": .5 },
			"confidence": "confirmed",
			"rules": ["KR-T03"],
			"blocks": ["theme.festive"]
		},
		{
			"id": "us-wwdc-2027",
			"market": "US",
			"name": "WWDC",
			"kind": "rival",
			"start": "2027-06-07",
			"end": "2027-06-11",
			"attention": .85,
			"audience": {
				"developer": .95,
				"prosumer": .9,
				"consumer": .6,
				"all": .4
			},
			"confidence": "estimated",
			"note": "往年在 6 月上旬",
			"rules": [],
			"blocks": []
		},
		{
			"id": "us-july4-2027",
			"market": "US",
			"name": "独立日",
			"kind": "holiday",
			"start": "2027-07-02",
			"end": "2027-07-05",
			"attention": .7,
			"audience": { "all": .7 },
			"confidence": "confirmed",
			"note": "7/5 补休",
			"rules": [],
			"blocks": []
		},
		{
			"id": "kr-unpacked-summer-2027",
			"market": "KR",
			"name": "三星折叠屏 Unpacked",
			"kind": "rival",
			"start": "2027-07-05",
			"end": "2027-07-25",
			"attention": .6,
			"audience": {
				"consumer": .7,
				"prosumer": .7,
				"all": .3
			},
			"confidence": "estimated",
			"note": "往年在 7 月",
			"rules": [],
			"blocks": []
		},
		{
			"id": "sg-ghost-month-2027",
			"market": "SG",
			"name": "农历七月（鬼月）",
			"kind": "sensitive",
			"start": "2027-08-02",
			"end": "2027-08-30",
			"attention": .4,
			"audience": {
				"consumer": .7,
				"prosumer": .3,
				"all": .1
			},
			"confidence": "estimated",
			"note": "起止日期是推算值，开发时用农历库计算",
			"rules": ["SG-T01"],
			"blocks": []
		},
		{
			"id": "sg-national-day-2027",
			"market": "SG",
			"name": "国庆日",
			"kind": "opportunity",
			"start": "2027-08-09",
			"end": "2027-08-09",
			"attention": .7,
			"audience": { "all": .7 },
			"confidence": "confirmed",
			"note": "可做国庆主题，但不要直接用国旗国徽",
			"rules": ["SG-C01"],
			"blocks": []
		},
		{
			"id": "us-backtoschool-2027",
			"market": "US",
			"name": "返校季",
			"kind": "opportunity",
			"start": "2027-08-09",
			"end": "2027-09-03",
			"attention": .5,
			"audience": { "student": .9 },
			"confidence": "rule",
			"note": "学习类 AI 工具的窗口",
			"rules": [],
			"blocks": []
		},
		{
			"id": "kr-liberation-2027",
			"market": "KR",
			"name": "光复节",
			"kind": "sensitive",
			"start": "2027-08-15",
			"end": "2027-08-16",
			"attention": .6,
			"audience": { "all": .6 },
			"confidence": "confirmed",
			"note": "8/16 补休；避免日本相关意象",
			"rules": ["KR-C01"],
			"blocks": ["theme.japan", "symbol.rising_sun"]
		},
		{
			"id": "us-laborday-2027",
			"market": "US",
			"name": "劳动节",
			"kind": "holiday",
			"start": "2027-09-06",
			"end": "2027-09-06",
			"attention": .5,
			"audience": { "all": .5 },
			"confidence": "confirmed",
			"rules": [],
			"blocks": []
		},
		{
			"id": "us-apple-sept-2027",
			"market": "US",
			"name": "Apple 秋季发布会",
			"kind": "rival",
			"start": "2027-09-07",
			"end": "2027-09-17",
			"attention": .85,
			"audience": {
				"consumer": .9,
				"prosumer": .9,
				"developer": .6,
				"all": .5
			},
			"confidence": "estimated",
			"note": "往年在 9 月上中旬",
			"rules": [],
			"blocks": []
		},
		{
			"id": "us-911-2027",
			"market": "US",
			"name": "9·11 纪念日",
			"kind": "sensitive",
			"start": "2027-09-11",
			"end": "2027-09-11",
			"attention": .6,
			"audience": { "all": .6 },
			"confidence": "rule",
			"rules": ["US-T01"],
			"blocks": ["theme.festive"]
		},
		{
			"id": "kr-chuseok-2027",
			"market": "KR",
			"name": "추석 中秋",
			"kind": "holiday",
			"start": "2027-09-14",
			"end": "2027-09-16",
			"attention": .95,
			"audience": { "all": .95 },
			"confidence": "confirmed",
			"rules": [],
			"blocks": []
		},
		{
			"id": "us-devday-2027",
			"market": "US",
			"name": "OpenAI DevDay",
			"kind": "rival",
			"start": "2027-10-01",
			"end": "2027-10-15",
			"attention": .7,
			"audience": {
				"developer": .95,
				"prosumer": .8,
				"enterprise": .6,
				"all": .3
			},
			"confidence": "estimated",
			"note": "往年在 10 月上旬；AI 产品最直接的撞档对手",
			"rules": [],
			"blocks": []
		},
		{
			"id": "kr-hangul-2027",
			"market": "KR",
			"name": "韩文日",
			"kind": "opportunity",
			"start": "2027-10-09",
			"end": "2027-10-11",
			"attention": .4,
			"audience": { "all": .4 },
			"confidence": "confirmed",
			"note": "10/11 补休；发布韩语能力相关功能的好时机",
			"rules": [],
			"blocks": []
		},
		{
			"id": "kr-halloween-2027",
			"market": "KR",
			"name": "万圣节/梨泰院纪念",
			"kind": "sensitive",
			"start": "2027-10-25",
			"end": "2027-10-31",
			"attention": .6,
			"audience": {
				"consumer": .8,
				"all": .5
			},
			"confidence": "rule",
			"note": "10/29 梨泰院事故纪念；万圣节主题高风险",
			"rules": ["KR-T01"],
			"blocks": ["theme.halloween", "theme.festive"]
		},
		{
			"id": "sg-deepavali-2027",
			"market": "SG",
			"name": "屠妖节",
			"kind": "holiday",
			"start": "2027-10-28",
			"end": "2027-10-28",
			"attention": .4,
			"audience": { "all": .4 },
			"confidence": "confirmed",
			"rules": [],
			"blocks": []
		}
	]
};
// src/shared/knowledge.ts
/**
* Knowledge base types and lookups. The source of truth is knowledge/*.yaml; `node scripts/build-knowledge.ts`
* validates it and writes knowledge.gen.ts, which both the Worker and the browser import.
*/
var MARKETS = [
	"US",
	"SG",
	"KR"
];
var SEGMENTS = [
	"developer",
	"prosumer",
	"consumer",
	"enterprise",
	"student"
];
var knowledge = KNOWLEDGE;
var byId = (items) => new Map(items.map((item) => [item.id, item]));
byId(knowledge.cases);
byId(knowledge.rules);
byId(knowledge.calendar);
/** An event's effect on one segment. */
var audienceOf = (event, segment) => event.audience[segment] ?? event.audience.all ?? 0;
// src/shared/signals.ts
var SIGNALS = {
	"gesture.pinch": {
		label: "拇指与食指捏/夹的手势",
		channel: "vision",
		hint: "A hand pinching or holding something between only the thumb and index finger, or a pinching gesture pointing at an object."
	},
	"symbol.rising_sun": {
		label: "旭日旗或放射状日章图案",
		channel: "vision",
		hint: "A rising-sun flag or a red disc with radiating rays."
	},
	"map.disputed_label": {
		label: "地图上的争议地区标注",
		channel: "vision",
		hint: "A map showing Dokdo/Takeshima, the East Sea/Sea of Japan, the nine-dash line or another disputed border or label."
	},
	"text.red_person_name": {
		label: "用红色书写的人名",
		channel: "vision",
		hint: "A living person's name written in red text."
	},
	"people.one_actor_many_races": {
		label: "同一演员扮演多个族群",
		channel: "vision",
		hint: "The same performer appears as characters of different ethnicities."
	},
	"people.altered_skin_tone": {
		label: "刻意加深或改变肤色的妆造",
		channel: "vision",
		hint: "Makeup or editing that darkens or changes a person's skin tone to portray another ethnicity."
	},
	"food.pork": {
		label: "猪肉或猪肉菜肴",
		channel: "vision",
		hint: "Pork or a pork dish (e.g. bak kut teh, char siu, bacon, ham)."
	},
	"food.alcohol": {
		label: "酒精饮品",
		channel: "vision",
		hint: "Alcoholic drinks (beer, wine, spirits, cocktails)."
	},
	"religion.decorative_symbol": {
		label: "宗教符号被用作装饰",
		channel: "vision",
		hint: "A religious figure, text or symbol used as decoration or on a product (e.g. Buddha statue as decor, scripture on a rug)."
	},
	"symbol.national_flag": {
		label: "国旗、国徽等国家象征",
		channel: "vision",
		hint: "A national flag, coat of arms or other state emblem."
	},
	"claim.crush_creativity": {
		label: "碾碎/淘汰人类创作的意象",
		channel: "vision",
		hint: "Imagery of instruments, art supplies, books or creative work being destroyed, crushed or replaced by a device or AI."
	},
	"claim.replace_humans": {
		label: "“取代人类/不用再雇人”叙事",
		channel: "text",
		hint: "Copy saying the product replaces people or jobs: 'fire your assistant', 'stop hiring humans', 'no need for a team'."
	},
	"claim.emotional_ghostwriting": {
		label: "AI 代替用户做情感表达",
		channel: "text",
		hint: "The AI writes personal or emotional messages on the user's behalf: love letters, wedding vows, a child's fan letter, apologies."
	},
	"claim.absolute_accuracy": {
		label: "“100% 准确/从不出错”等绝对化宣称",
		channel: "text",
		hint: "Absolute capability claims: '100% accurate', 'never hallucinates', 'zero errors', 'always right'."
	},
	"claim.replace_professional": {
		label: "“替代律师/医生/会计”等专业替代宣称",
		channel: "text",
		hint: "Claims that the AI replaces a licensed professional: 'your AI lawyer', 'no need for a doctor', 'robot accountant'."
	},
	"claim.ai_testimonial": {
		label: "AI 生成或虚构的用户评价",
		channel: "page",
		hint: "Testimonials, reviews or customer logos that are AI-generated, invented or not from real users (use the page notes)."
	},
	"privacy.no_local_policy": {
		label: "没有当地语言的隐私政策",
		channel: "page",
		hint: "The page notes say there is no privacy policy in the target market's language."
	},
	"privacy.no_data_residency": {
		label: "没有说明数据存储地和跨境传输",
		channel: "page",
		hint: "The page notes say where user data is stored or transferred is not stated."
	},
	"ai.no_disclosure": {
		label: "没有说明 AI 生成内容的标识方式",
		channel: "page",
		hint: "The page notes say AI-generated output is not labelled or disclosed."
	},
	"theme.halloween": {
		label: "万圣节元素（南瓜、鬼怪、变装派对）",
		channel: "theme",
		hint: "Halloween theme: pumpkins, ghosts, costumes, trick-or-treat, Halloween party."
	},
	"theme.festive": {
		label: "狂欢/派对/大促式的热闹基调",
		channel: "theme",
		hint: "A loud celebratory tone: party, festival, confetti, flash sale, 'let's go wild'."
	},
	"theme.japan": {
		label: "日本相关意象",
		channel: "theme",
		hint: "Japanese cultural imagery: kimono, torii, rising sun, Mount Fuji, Japanese text."
	}
};
var SIGNAL_IDS = Object.keys(SIGNALS);
var isSignalId = (value) => typeof value === "string" && Object.hasOwn(SIGNALS, value);
SIGNAL_IDS.filter((id) => SIGNALS[id].channel === "theme");
// src/engine/launch/plan.ts
/**
* The launch-pressure calendar: ClearRun's release engine, re-aimed at product launches abroad.
* Rivals are the events in knowledge/calendar.yaml (tech keynotes, shopping festivals, long holidays,
* national moments); overlap is how much each event takes from your audience segment; and sensitive
* dates don't just add pressure, they block a week when your creative carries a theme they clash with.
* Pure functions shared by the Worker and the browser, so what-ifs recompute instantly.
*/
/** Weight of each week of your launch's buzz: launch week, then the two after it (an AI launch fades fast). */
var LAUNCH_RUN = [
	1,
	.5,
	.25
];
var RUN_TOTAL = LAUNCH_RUN.reduce((a, b) => a + b, 0);
/** How strongly each kind of event takes attention, and how much spills into the week before and after it. */
var KIND_EFFECT = {
	rival: {
		weight: 1,
		before: .3,
		after: .4
	},
	holiday: {
		weight: 1,
		before: .2,
		after: .1
	},
	sensitive: {
		weight: .4,
		before: 0,
		after: 0
	},
	opportunity: {
		weight: 0,
		before: 0,
		after: 0
	}
};
/** Roughly a full national holiday in your launch week. Pressure is shown relative to it, so markets compare. */
var PRESSURE_REF = .6;
/** Events spanning more than two weeks are diffuse (an uncertain keynote window, a month-long period). */
var DIFFUSE_DAYS = 14;
var OPPORTUNITY_GAIN = .5;
var MAX_BONUS = .25;
/** Blocks apply when a clashing event falls in your launch week or the week after. */
var BLOCK_WEEKS = 2;
/**
* What each week of waiting costs when picking weeks: a launch that slips has a price, so among weeks
* about as clear, the earlier one wins (26 weeks out costs 0.26 of clear). Clear itself is unaffected.
*/
var DELAY_COST = .01;
/** In a rollout, each week a later market trails the one before it costs more: the launch's momentum fades. */
var FOLLOW_COST = .03;
var LaunchInputError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "LaunchInputError";
	}
};
var DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Validates a request from the network or the URL. `today` sets the default first week (two weeks out). */
function normalizeLaunchRequest(body, today) {
	const raw = body ?? {};
	const markets = Array.isArray(raw.markets) ? [...new Set(raw.markets.filter((m) => MARKETS.includes(m)))] : [];
	if (!markets.length) throw new LaunchInputError("markets must list at least one of KR, US, SG");
	const segment = SEGMENTS.includes(raw.segment) ? raw.segment : void 0;
	if (!segment) throw new LaunchInputError(`segment must be one of ${SEGMENTS.join(", ")}`);
	const themes = Array.isArray(raw.themes) ? [...new Set(raw.themes.filter(isSignalId))] : [];
	const from = typeof raw.from === "string" && DAY.test(raw.from) ? raw.from : addDays(today, 14);
	const weeks = Math.min(52, Math.max(4, Math.round(Number(raw.weeks) || 26)));
	const yours = {};
	if (raw.yours && typeof raw.yours === "object") {
		for (const [market, day] of Object.entries(raw.yours)) if (markets.includes(market) && typeof day === "string" && DAY.test(day)) yours[market] = day;
	}
	return {
		markets,
		segment,
		themes,
		from,
		weeks,
		...Object.keys(yours).length ? { yours } : {}
	};
}
/** How much of an event lands in the week starting `monday`, 0–1, including spill into the weeks either side. */
function intensity(event, monday) {
	const diffuse = daysBetween(event.start, event.end) + 1 > DIFFUSE_DAYS ? .5 : 1;
	const days = overlapDays(event.start, event.end, monday);
	if (days > 0) return diffuse * Math.min(1, (days + 1) / 3);
	const effect = KIND_EFFECT[event.kind];
	const next = addDays(monday, 7);
	if (overlapDays(event.start, event.end, next) > 0 && event.start >= next) return diffuse * effect.before;
	if (event.end < monday && event.end >= addDays(monday, -7)) return diffuse * effect.after;
	return 0;
}
/** Pressure on one calendar week (not a launch run) for a segment, with each event's part. */
function weekPressure(events, monday, segment) {
	const parts = /* @__PURE__ */ new Map();
	let total = 0;
	for (const event of events) {
		const weight = KIND_EFFECT[event.kind].weight;
		if (!weight) continue;
		const value = weight * event.attention * audienceOf(event, segment) * intensity(event, monday);
		if (value <= 0) continue;
		parts.set(event.id, value);
		total += value;
	}
	return {
		total,
		parts
	};
}
function scoreWeek(events, week, request, coverageStart, coverageEnd) {
	const byEvent = /* @__PURE__ */ new Map();
	let pressure = 0;
	LAUNCH_RUN.forEach((weight, j) => {
		const { total, parts } = weekPressure(events, addDays(week, 7 * j), request.segment);
		pressure += weight * total / RUN_TOTAL;
		for (const [id, value] of parts) byEvent.set(id, (byEvent.get(id) ?? 0) + weight * value / RUN_TOTAL);
	});
	let bonus = 0;
	const opportunities = [];
	for (const event of events) {
		if (event.kind !== "opportunity") continue;
		const lift = OPPORTUNITY_GAIN * event.attention * audienceOf(event, request.segment) * intensity(event, week);
		if (lift > .02) {
			bonus += lift;
			opportunities.push(event.id);
		}
	}
	bonus = Math.min(MAX_BONUS, bonus);
	const themes = new Set(request.themes);
	const blocks = [];
	for (const event of events) {
		const clash = event.blocks.filter((s) => themes.has(s));
		if (!clash.length) continue;
		if (Array.from({ length: BLOCK_WEEKS }, (_, j) => overlapDays(event.start, event.end, addDays(week, 7 * j))).some((d) => d > 0)) blocks.push({
			eventId: event.id,
			signals: clash,
			rules: event.rules
		});
	}
	const contributors = [...byEvent.entries()].map(([eventId, value]) => ({
		eventId,
		pressure: value
	})).sort((a, b) => b.pressure - a.pressure);
	const top = contributors.slice(0, 3).map((c) => events.find((e) => e.id === c.eventId));
	const p = Math.min(1, pressure / PRESSURE_REF);
	return {
		week,
		pressure,
		p,
		bonus,
		clear: Math.max(0, Math.min(1, 1 - p + bonus)),
		blocks,
		contributors,
		opportunities,
		estimated: top.some((e) => e?.confidence === "estimated"),
		covered: coverageStart !== "" && week >= coverageStart && addDays(week, 7 * LAUNCH_RUN.length - 1) <= coverageEnd
	};
}
/** Top weeks by score, at least `gap` weeks apart. Ties keep calendar order. */
function topSpaced(weeks, score, count, gap = 2) {
	const picked = [];
	for (const w of [...weeks].sort((a, b) => score(b) - score(a) || a.week.localeCompare(b.week))) {
		if (picked.length >= count) break;
		if (picked.every((p) => Math.abs(daysBetween(p.week, w.week)) >= gap * 7)) picked.push(w);
	}
	return picked.map((w) => w.week);
}
var eligible = (w) => w.covered && w.blocks.length === 0;
/** Clear, less the cost of waiting since `first` (the earliest candidate week). Used to pick weeks, never shown as clear. */
var pickScore = (w, first, cost = DELAY_COST) => w.clear - cost * (daysBetween(first, w.week) / 7);
function verdict(weeks, yourWeek) {
	const week = mondayOf(yourWeek);
	const mine = weeks.find((w) => w.week === week);
	const ranked = [...weeks].sort((a, b) => b.clear - a.clear || a.week.localeCompare(b.week));
	const best = ranked.find((w) => w.week !== week && eligible(w));
	if (!mine || !best) return void 0;
	return {
		week,
		rank: ranked.indexOf(mine) + 1,
		of: ranked.length,
		hold: eligible(mine) && mine.clear >= .9 * best.clear,
		best: best.week
	};
}
function planMarket(market, request, events = knowledge.calendar) {
	const mine = events.filter((e) => e.market === market);
	const coverageStart = events.reduce((min, e) => min === "" || e.start < min ? e.start : min, "");
	const coverageEnd = events.reduce((max, e) => e.end > max ? e.end : max, "");
	const weeks = listMondays(request.from, request.weeks).map((week) => scoreWeek(mine, week, request, coverageStart, coverageEnd));
	const yours = request.yours?.[market];
	const first = weeks[0]?.week ?? request.from;
	return {
		market,
		weeks,
		best: topSpaced(weeks.filter(eligible), (w) => pickScore(w, first), 3),
		danger: topSpaced(weeks.filter((w) => w.p >= .5), (w) => w.p, 3),
		...yours ? { verdict: verdict(weeks, yours) } : {}
	};
}
/**
* A staggered rollout in the requested market order. The first market takes its best eligible week
* (clear, less the cost of waiting); each later market takes its best week no earlier than the one
* before it, paying FOLLOW_COST for every week it trails (launching together is allowed).
*/
function rollout(plans) {
	const steps = [];
	let after = "";
	for (const plan of plans) {
		const first = after || plan.weeks[0]?.week || "";
		const cost = after ? FOLLOW_COST : DELAY_COST;
		const pick = [...plan.weeks].filter((w) => eligible(w) && w.week >= after).sort((a, b) => pickScore(b, first, cost) - pickScore(a, first, cost) || a.week.localeCompare(b.week))[0];
		if (!pick) continue;
		steps.push({
			market: plan.market,
			week: pick.week,
			clear: pick.clear
		});
		after = pick.week;
	}
	return steps;
}
function planLaunch(request, events = knowledge.calendar) {
	const markets = request.markets.map((market) => planMarket(market, request, events));
	const days = events.flatMap((e) => [e.start, e.end]).sort();
	return {
		request,
		markets,
		rollout: rollout(markets),
		coverage: {
			start: days[0] ?? "",
			end: days[days.length - 1] ?? ""
		}
	};
}
// src/shared/demo.ts
var DEMO_CASES = [
	{
		id: "kr-kv",
		title: "产品主视觉与隐私页",
		pitch: "对照全球统一版与韩国本地化版，检查主视觉中的手势、隐私页语言和数据存储说明。",
		focus: "KR",
		markets: [
			"US",
			"SG",
			"KR"
		],
		segment: "prosumer",
		original: {
			label: "全球统一版",
			assets: [
				{
					id: "kv",
					kind: "image",
					label: "主视觉 KV",
					content: "/demo/mira-global.webp"
				},
				{
					id: "copy",
					kind: "copy",
					label: "主文案",
					content: "Mira Agent. Your work, handled."
				},
				{
					id: "page",
					kind: "page",
					label: "落地页与隐私页",
					content: "落地页语言：英文、简体中文。隐私政策只有英文版，没有写明用户数据存储在哪个地区、是否跨境传输。AI 生成的内容没有任何标识说明。"
				}
			],
			signals: [
				{
					signal: "gesture.pinch",
					asset: "kv",
					evidence: "拇指和食指捏住手机的上下两端",
					box: [
						.52,
						.076,
						.466,
						.82
					],
					confidence: .92
				},
				{
					signal: "privacy.no_local_policy",
					asset: "page",
					evidence: "隐私政策只有英文版",
					quotes: ["隐私政策只有英文版"],
					confidence: .95
				},
				{
					signal: "privacy.no_data_residency",
					asset: "page",
					evidence: "没有写明数据存储地区与跨境传输",
					quotes: ["没有写明用户数据存储在哪个地区、是否跨境传输"],
					confidence: .95
				},
				{
					signal: "ai.no_disclosure",
					asset: "page",
					evidence: "AI 生成内容没有标识说明",
					quotes: ["AI 生成的内容没有任何标识说明"],
					confidence: .9
				}
			]
		},
		localized: {
			label: "韩国本地化版",
			assets: [
				{
					id: "kv",
					kind: "image",
					label: "主视觉 KV（韩国版）",
					content: "/demo/mira-kr.webp"
				},
				{
					id: "copy",
					kind: "copy",
					label: "主文案",
					content: "Mira Agent. 당신의 일, 맡겨 주세요."
				},
				{
					id: "page",
					kind: "page",
					label: "落地页与隐私页",
					content: "落地页和隐私政策提供韩文版。用户数据存储在首尔区域，不向第三国传输；韩国本地代表与联系方式已列出。AI 生成的内容会标注“AI 생성”。"
				}
			],
			signals: []
		}
	},
	{
		id: "us-copy",
		title: "产品发布文案与用户推荐语",
		pitch: "对照初稿与改稿，检查产品效果承诺、用户推荐语及其来源。",
		focus: "US",
		markets: ["US"],
		segment: "enterprise",
		original: {
			label: "初稿",
			assets: [
				{
					id: "hero",
					kind: "image",
					label: "落地页首屏",
					content: "/demo/b-hero.svg"
				},
				{
					id: "copy",
					kind: "copy",
					label: "发布文案",
					content: "Fire your assistant. Hire Mira.\n100% accurate. Never hallucinates.\n“Mira wrote my wedding vows in 30 seconds.” — Jamie R., Austin"
				},
				{
					id: "page",
					kind: "page",
					label: "落地页备注",
					content: "首屏的三条用户推荐语由 AI 生成，用来“示意效果”，不是真实用户。"
				}
			],
			signals: [
				{
					signal: "claim.replace_humans",
					asset: "hero",
					evidence: "Fire your assistant. Hire Mira.",
					box: [
						.08,
						.26,
						.84,
						.16
					],
					confidence: .95
				},
				{
					signal: "claim.absolute_accuracy",
					asset: "hero",
					evidence: "100% accurate. Never hallucinates.",
					box: [
						.08,
						.44,
						.6,
						.08
					],
					confidence: .95
				},
				{
					signal: "claim.emotional_ghostwriting",
					asset: "copy",
					evidence: "Mira wrote my wedding vows",
					quotes: ["Mira wrote my wedding vows in 30 seconds."],
					confidence: .85
				},
				{
					signal: "claim.ai_testimonial",
					asset: "page",
					evidence: "推荐语由 AI 生成，不是真实用户",
					quotes: ["用户推荐语由 AI 生成", "不是真实用户"],
					confidence: .95
				}
			]
		},
		localized: {
			label: "改稿",
			assets: [
				{
					id: "hero",
					kind: "image",
					label: "落地页首屏",
					content: "/demo/b-hero-fixed.svg"
				},
				{
					id: "copy",
					kind: "copy",
					label: "发布文案",
					content: "Give your team back 10 hours a week.\n92% task success on our public benchmark — see the methodology.\n“Mira drafts the follow-ups so I can focus on the client.” — verified customer"
				},
				{
					id: "page",
					kind: "page",
					label: "落地页备注",
					content: "推荐语全部来自真实付费客户，已获书面授权。基准测试方法与数据集公开。"
				}
			],
			signals: []
		}
	},
	{
		id: "sg-frame",
		title: "多语言宣传片关键帧",
		pitch: "对照初版与重拍版，检查宣传片如何通过选角、化妆和字幕表现多语言场景。",
		focus: "SG",
		markets: ["SG", "US"],
		segment: "consumer",
		original: {
			label: "初版",
			assets: [{
				id: "frame",
				kind: "image",
				label: "视频关键帧",
				content: "/demo/c-frame.svg"
			}, {
				id: "copy",
				kind: "copy",
				label: "字幕",
				content: "Mira speaks your language — 华语 · Bahasa Melayu · தமிழ் · English"
			}],
			signals: [
				{
					signal: "people.one_actor_many_races",
					asset: "frame",
					evidence: "同一位演员出现在三个族群角色中",
					box: [
						.02,
						.1,
						.96,
						.66
					],
					confidence: .9
				},
				{
					signal: "people.altered_skin_tone",
					asset: "frame",
					evidence: "第二、三个角色的肤色被刻意加深",
					box: [
						.35,
						.12,
						.62,
						.5
					],
					confidence: .85
				},
				{
					signal: "food.pork",
					asset: "frame",
					evidence: "桌上一碗肉骨茶（猪肋排汤）",
					box: [
						.06,
						.62,
						.22,
						.2
					],
					confidence: .8
				}
			]
		},
		localized: {
			label: "重拍版",
			assets: [{
				id: "frame",
				kind: "image",
				label: "视频关键帧（重拍）",
				content: "/demo/c-frame-fixed.svg"
			}, {
				id: "copy",
				kind: "copy",
				label: "字幕",
				content: "Mira speaks your language — 华语 · Bahasa Melayu · தமிழ் · English"
			}],
			signals: []
		}
	}
];
var demoCase = (id) => DEMO_CASES.find((c) => c.id === id);
// src/shared/scan-source.ts
/**
* A demo case is preset signals either way. On a live deployment that is a fixture
* (the model was available and was not called). Anywhere else it is the offline demo,
* which must not be reported as a live or fixture-on-live result.
*/
function demoScanSource(scanMode) {
	return scanMode === "live" ? "fixture" : "offline";
}
/** A model answer stays a model answer. A different model id means a backup model, not an offline fallback. */
function modelAnswerMeta(answered, primary) {
	const model = answered?.trim() || void 0;
	return {
		...model ? { model } : {},
		fallbackModel: Boolean(model && model !== primary)
	};
}
// src/worker/store.ts
/** D1 storage. For now only the model-spend ledger, checked before every model call. */
var SCHEMA = ["CREATE TABLE IF NOT EXISTS llm_spend (day TEXT PRIMARY KEY, cost_usd REAL NOT NULL DEFAULT 0, calls INTEGER NOT NULL DEFAULT 0, tokens INTEGER NOT NULL DEFAULT 0)"];
var ready;
/** Creates the tables once per isolate. */
function ensureSchema(db) {
	if (!ready) ready = db.batch(SCHEMA.map((sql) => db.prepare(sql))).then(() => void 0);
	return ready;
}
var dayKey = (now = /* @__PURE__ */ new Date()) => now.toISOString().slice(0, 10);
async function llmSpend(db) {
	await ensureSchema(db);
	const row = await db.prepare("SELECT (SELECT cost_usd FROM llm_spend WHERE day = ?1) AS today, (SELECT SUM(cost_usd) FROM llm_spend) AS total").bind(dayKey()).first();
	return {
		today: row?.today ?? 0,
		total: row?.total ?? 0
	};
}
async function recordLlmSpend(db, costUsd, tokens) {
	await ensureSchema(db);
	await db.prepare(`INSERT INTO llm_spend (day, cost_usd, calls, tokens) VALUES (?1, ?2, 1, ?3)
			 ON CONFLICT(day) DO UPDATE SET cost_usd = cost_usd + ?2, calls = calls + 1, tokens = tokens + ?3`).bind(dayKey(), costUsd, tokens).run();
}
// src/worker/openrouter.ts
/**
* OpenRouter (OpenAI-compatible chat completions) with a hard spending guard. Every call checks the
* D1 ledger first (daily and all-time caps) and records its exact cost afterwards (`usage.cost`).
* Defaults are frugal: Claude Haiku 5.5, low reasoning effort, small max_tokens, and automatic prompt
* caching (a top-level `cache_control`, so the system prompt and tools are read from cache after the
* first call of a run).
*/
var OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
/** USD per million tokens for the default model, used only if a response carries no cost. */
var FALLBACK_PRICE = {
	input: .1,
	output: .5
};
var BudgetExhaustedError = class extends Error {
	constructor() {
		super("The agent has reached its spending cap for now; the calendar and scores still work.");
		this.name = "BudgetExhaustedError";
	}
};
var LlmError = class extends Error {
	status;
	constructor(status, message) {
		super(message);
		this.name = "LlmError";
		this.status = status;
	}
};
async function chat(db, config, request) {
	const spent = await llmSpend(db);
	if (spent.today >= config.dailyUsd || spent.total >= config.totalUsd) throw new BudgetExhaustedError();
	const response = await fetch(OPENROUTER_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${config.apiKey}`,
			"Content-Type": "application/json",
			...config.appUrl ? {
				"HTTP-Referer": config.appUrl,
				"X-Title": "ClearRun Global"
			} : {}
		},
		body: JSON.stringify({
			model: config.model,
			models: [config.model, ...config.fallbackModels],
			messages: request.messages,
			...request.tools ? {
				tools: request.tools,
				tool_choice: request.toolChoice ?? "auto"
			} : {},
			max_tokens: Math.min(request.maxTokens ?? config.maxTokens, config.maxTokens),
			reasoning: { effort: "low" },
			cache_control: { type: "ephemeral" },
			...request.sessionId ? { session_id: request.sessionId } : {},
			usage: { include: true }
		})
	});
	if (!response.ok) throw new LlmError(response.status, `OpenRouter ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
	const data = await response.json();
	const inputTokens = data.usage?.prompt_tokens ?? 0;
	const outputTokens = data.usage?.completion_tokens ?? 0;
	const costUsd = typeof data.usage?.cost === "number" ? data.usage.cost : (inputTokens * FALLBACK_PRICE.input + outputTokens * FALLBACK_PRICE.output) / 1e6;
	await recordLlmSpend(db, costUsd, inputTokens + outputTokens);
	const raw = data.choices?.[0]?.message ?? {};
	return {
		message: {
			role: "assistant",
			content: raw.content ?? null,
			...raw.tool_calls?.length ? { tool_calls: raw.tool_calls } : {},
			...raw.reasoning_details?.length ? { reasoning_details: raw.reasoning_details } : {}
		},
		finishReason: data.choices?.[0]?.finish_reason,
		model: data.model,
		usage: {
			inputTokens,
			cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
			outputTokens,
			reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
			costUsd
		}
	};
}
// src/engine/creative/assess.ts
var clamp01 = (n) => Math.max(0, Math.min(1, n));
/** Validates signals from the model (or a fixture): unknown IDs are dropped, boxes clamped, text trimmed. */
function cleanSignals(raw, assets) {
	if (!Array.isArray(raw)) return [];
	const known = new Set(assets);
	const out = [];
	for (const item of raw) {
		if (!item || !isSignalId(item.signal)) continue;
		const asset = typeof item.asset === "string" && known.has(item.asset) ? item.asset : assets[0];
		if (!asset) continue;
		const confidence = typeof item.confidence === "number" ? clamp01(item.confidence) : .7;
		const evidence = typeof item.evidence === "string" ? item.evidence.trim().slice(0, 200) : "";
		const quotes = Array.isArray(item.quotes) ? item.quotes.filter((quote) => typeof quote === "string").map((quote) => quote.trim().slice(0, 240)).filter((quote) => quote.length >= 2).slice(0, 8) : [];
		let box;
		if (Array.isArray(item.box) && item.box.length === 4 && item.box.every((n) => typeof n === "number" && Number.isFinite(n))) {
			const [x, y, w, h] = item.box.map(clamp01);
			if (w > 0 && h > 0) box = [
				x,
				y,
				Math.min(w, 1 - x),
				Math.min(h, 1 - y)
			];
		}
		out.push({
			signal: item.signal,
			asset,
			evidence,
			confidence,
			...quotes.length ? { quotes } : {},
			...box ? { box } : {}
		});
	}
	return out;
}
// src/worker/perceive.ts
/**
* The perception step of the creative check: one multimodal model call that reports which vocabulary
* signals appear in the material, where, and with what evidence. It is told not to judge; judgment is
* engine/creative/assess.ts over knowledge/rules.yaml.
*/
var PerceiveInputError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "PerceiveInputError";
	}
};
var MAX_ASSETS = 6;
var MAX_TEXT = 4e3;
/** About 3 MB of base64 per image keeps a request well inside the model's limits. */
var MAX_IMAGE_CHARS = 4e6;
var IMAGE_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
var PERCEIVE_SYSTEM = [
	"You are the perception step of a pre-launch creative check for products launching in South Korea, Singapore and the United States.",
	"Report only what you can actually see or read in the material, using ONLY the signal IDs listed below.",
	"Do not judge whether anything is offensive, risky or legal: a separate rulebook decides that. Never invent signals that are not listed.",
	"Page signals come only from the page notes. Theme signals describe the creative's overall theme or tone.",
	"For images, give box as [x, y, width, height] in fractions of the image (0–1), tight around what you saw. Omit box for text.",
	"evidence: a short description, in Chinese, of what you saw. It does not have to be a verbatim substring.",
	"quotes: for text, exact substrings copied from that asset, which the UI highlights. Omit quotes when you cannot copy one. confidence: 0–1.",
	"Reply with JSON only, no prose: {\"signals\":[{\"signal\":\"…\",\"asset\":\"…\",\"evidence\":\"…\",\"quotes\":[\"exact words\"],\"box\":[0,0,0,0],\"confidence\":0.9}]}. Reply {\"signals\":[]} when nothing applies.",
	"",
	"Signals:",
	...SIGNAL_IDS.map((id) => `- ${id} [${SIGNALS[id].channel}]: ${SIGNALS[id].hint}`)
].join("\n");
/** Validates assets from the browser before any model call. */
function checkAssets(raw) {
	if (!Array.isArray(raw) || !raw.length) throw new PerceiveInputError("assets must be a non-empty list");
	if (raw.length > MAX_ASSETS) throw new PerceiveInputError(`at most ${MAX_ASSETS} assets per check`);
	const seen = /* @__PURE__ */ new Set();
	return raw.map((item, i) => {
		const id = typeof item?.id === "string" && /^[\w-]{1,32}$/.test(item.id) ? item.id : `asset${i + 1}`;
		if (seen.has(id)) throw new PerceiveInputError(`duplicate asset id ${id}`);
		seen.add(id);
		const kind = item?.kind === "image" || item?.kind === "copy" || item?.kind === "page" ? item.kind : void 0;
		if (!kind) throw new PerceiveInputError(`asset ${id}: kind must be image, copy or page`);
		const content = typeof item.content === "string" ? item.content : "";
		if (kind === "image" && (!IMAGE_URL.test(content.slice(0, 64) + content.slice(-8)) || content.length > MAX_IMAGE_CHARS)) throw new PerceiveInputError(`asset ${id}: image must be a PNG, JPEG, WebP or GIF data: URL under 3 MB`);
		if (kind !== "image" && (!content.trim() || content.length > MAX_TEXT)) throw new PerceiveInputError(`asset ${id}: text must be 1–${MAX_TEXT} characters`);
		return {
			id,
			kind,
			label: typeof item.label === "string" ? item.label.slice(0, 60) : id,
			content
		};
	});
}
/** The JSON object in a model reply, tolerating code fences or a stray sentence around it. */
function parseSignalsReply(text, assetIds) {
	const start = text?.indexOf("{") ?? -1;
	const end = text?.lastIndexOf("}") ?? -1;
	if (text && start >= 0 && end > start) try {
		const parsed = JSON.parse(text.slice(start, end + 1));
		if (Array.isArray(parsed?.signals)) {
			const signals = cleanSignals(parsed.signals, assetIds);
			if (signals.length === parsed.signals.length) return signals;
		}
	} catch {}
	throw new LlmError(502, "Invalid perception response");
}
async function perceive(db, llm, assets) {
	const content = [];
	for (const asset of assets) {
		content.push({
			type: "text",
			text: `Asset "${asset.id}" (${asset.kind}: ${asset.label}):`
		});
		content.push(asset.kind === "image" ? {
			type: "image_url",
			image_url: { url: asset.content }
		} : {
			type: "text",
			text: asset.content
		});
	}
	content.push({
		type: "text",
		text: "List the signals you find, as JSON."
	});
	const result = await chat(db, llm, {
		messages: [{
			role: "system",
			content: PERCEIVE_SYSTEM
		}, {
			role: "user",
			content
		}],
		maxTokens: 1500
	});
	return {
		signals: parseSignalsReply(result.message.content, assets.map((a) => a.id)),
		model: result.model
	};
}
// src/worker/index.ts
var app = new Hono().basePath("/api");
function numberOr(value, fallback) {
	const n = Number(value);
	return Number.isFinite(n) && n >= 0 ? n : fallback;
}
/** The perception model's settings, when live scanning is on and its key is present. */
function llmFor(env) {
	if (env.SCAN_MODE !== "live") return void 0;
	const apiKey = env.OPENROUTER_API_KEY?.trim();
	if (!apiKey) return void 0;
	return {
		apiKey,
		model: env.VISION_MODEL || "anthropic/claude-haiku-5.5",
		fallbackModels: (env.VISION_FALLBACK_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean),
		maxTokens: 2e3,
		dailyUsd: numberOr(env.LLM_DAILY_USD, 1),
		totalUsd: numberOr(env.LLM_TOTAL_USD, 10)
	};
}
var rateLimited = async (c) => !(await c.env.RATE_LIMITER.limit({ key: c.req.header("cf-connecting-ip") ?? "local" })).success;
function log(message, fields = {}) {
	console.log(JSON.stringify({
		message,
		...fields
	}));
}
var marketsOf = (raw) => Array.isArray(raw) ? [...new Set(raw.filter((m) => MARKETS.includes(m)))] : [];
app.get("/health", async (c) => {
	const llm = llmFor(c.env);
	const body = {
		name: "ClearRun Global",
		scan: llm ? "live" : "offline",
		...llm ? { model: llm.model } : {}
	};
	if (llm) {
		const spend = await llmSpend(c.env.DB);
		body.budget = {
			todayUsd: Math.round(spend.today * 1e4) / 1e4,
			dailyCapUsd: llm.dailyUsd
		};
	}
	return c.json(body, 200, { "Cache-Control": "no-store" });
});
/** The whole knowledge base (cases, rules, calendar), for tools and agents. The browser bundles its own copy. */
app.get("/knowledge", (c) => c.json(knowledge, 200, { "Cache-Control": "public, max-age=300" }));
/** The launch-pressure calendar for one request (the browser computes the same thing locally for what-ifs). */
app.post("/launch", async (c) => {
	const body = await c.req.json().catch(() => void 0);
	try {
		return c.json(planLaunch(normalizeLaunchRequest(body, isoDay(/* @__PURE__ */ new Date()))), 200, { "Cache-Control": "no-store" });
	} catch (error) {
		if (error instanceof LaunchInputError) return c.json({
			error: "bad_request",
			message: error.message
		}, 400);
		throw error;
	}
});
/**
* The perception step. A demo case answers from its fixture (no model, works offline); your own
* assets go to the multimodal model. Either way the browser judges the signals against the rules.
*/
app.post("/scan", async (c) => {
	const body = await c.req.json().catch(() => void 0);
	if (!body) return c.json({
		error: "bad_request",
		message: "Expected a JSON body"
	}, 400);
	if (!marketsOf(body.markets).length) return c.json({
		error: "bad_request",
		message: "markets must list at least one of KR, US, SG"
	}, 400);
	if (body.demo) {
		const demo = typeof body.demo.caseId === "string" ? demoCase(body.demo.caseId) : void 0;
		if (!demo) return c.json({
			error: "bad_request",
			message: "Unknown demo case"
		}, 400);
		const response = {
			signals: (body.demo.variant === "localized" ? demo.localized : demo.original).signals,
			source: demoScanSource(c.env.SCAN_MODE)
		};
		return c.json(response, 200, { "Cache-Control": "no-store" });
	}
	const llm = llmFor(c.env);
	if (!llm) return c.json({
		error: "offline",
		message: "This deployment has no perception model configured; try a demo case, or add OPENROUTER_API_KEY and run in live mode."
	}, 503);
	if (await rateLimited(c)) return c.json({
		error: "rate_limited",
		message: "Too many checks from this address. Try again in a minute."
	}, 429);
	try {
		const assets = checkAssets(body.assets);
		const { signals, model } = await perceive(c.env.DB, llm, assets);
		const answered = modelAnswerMeta(model, llm.model);
		log("scan", {
			assets: assets.length,
			signals: signals.length,
			model: answered.model,
			fallbackModel: answered.fallbackModel
		});
		const response = {
			signals,
			source: "model",
			...answered.model ? { model: answered.model } : {},
			...answered.fallbackModel ? { fallbackModel: true } : {}
		};
		return c.json(response, 200, { "Cache-Control": "no-store" });
	} catch (error) {
		if (error instanceof PerceiveInputError) return c.json({
			error: "bad_request",
			message: error.message
		}, 400);
		if (error instanceof BudgetExhaustedError) return c.json({
			error: "budget",
			message: error.message
		}, 503);
		if (error instanceof LlmError) {
			log("llm error", { status: error.status });
			return c.json({
				error: "model_unavailable",
				message: "The perception model didn't answer. Try again in a moment."
			}, 502);
		}
		throw error;
	}
});
// \0virtual:cloudflare/worker-entry
var worker_entry_default = { fetch: (request, env, ctx) => app.fetch(request, env, ctx) };
export { app as api, worker_entry_default as default };

//# sourceMappingURL=index.js.map