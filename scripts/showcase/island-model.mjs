// Local scripted Responses model; file reads still execute through the real host.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as pause } from 'node:timers/promises';

export async function islandModel() {
  const jobs = [], calls = [], errors = [];
  const server = createServer(async (request, response) => {
    try {
      if (request.method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ data: [{ id: 'atlas-demo', object: 'model' }] }));
        return;
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body.stream) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }] }));
        return;
      }
      assert.equal(request.url, '/v1/responses');
      const next = jobs.shift();
      const job = typeof next === 'function' ? await next(body) : next;
      assert.ok(job, 'Unexpected demo model request');
      if (job.tool) job.tool = body.tools.find(tool => tool.name.replace(/[._-]/g, '') === job.tool.replace(/[._-]/g, ''))?.name ?? job.tool;
      if (job.tool) assert.ok(body.tools.some(tool => tool.name === job.tool), `Unavailable tool: ${job.tool}`);
      const outputs = (body.input ?? []).filter(item => item.type === 'function_call_output');
      for (const text of job.expectsOutput ?? [])
        assert.ok(JSON.stringify(outputs).includes(text), `Missing real tool output: ${text}`);
      for (const text of job.expectsHistory ?? [])
        assert.ok(JSON.stringify(body.input).includes(text), `Missing conversation history: ${text}`);
      const id = `atlas-${calls.length}`;
      calls.push({ tool: job.tool ?? 'reply', ...(job.args ? { args: job.args } : {}),
        verifiedOutput: job.expectsOutput ?? [], verifiedHistory: job.expectsHistory ?? [] });
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const emit = event => response.write(`data: ${JSON.stringify(event)}\n\n`);
      emit({ type: 'response.created', response: { id, created_at: 1, model: 'atlas-demo' } });
      await pause(350);
      if (job.tool) {
        const item = { type: 'function_call', id, call_id: id, name: job.tool,
          arguments: JSON.stringify(job.args), status: 'completed' };
        emit({ type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '' } });
        emit({ type: 'response.function_call_arguments.delta', item_id: id, output_index: 0, delta: item.arguments });
        await pause(300);
        emit({ type: 'response.output_item.done', output_index: 0, item });
      } else {
        const item = { type: 'message', id };
        emit({ type: 'response.output_item.added', output_index: 0, item });
        for (const part of job.text.match(new RegExp(`.{1,${job.chunkSize ?? 7}}|\\n`, 'gu')) ?? []) {
          emit({ type: 'response.output_text.delta', item_id: id, delta: part });
          await pause(job.interval ?? 120);
        }
        emit({ type: 'response.output_item.done', output_index: 0, item });
      }
      emit({ type: 'response.completed', response: { usage: { input_tokens: 300, output_tokens: 150 } } });
      response.end();
    } catch (error) {
      errors.push(String(error)); console.error(String(error));
      if (!response.headersSent) response.writeHead(500);
      response.end('Demo model failed');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { baseURL: `http://127.0.0.1:${server.address().port}/v1`, calls, errors,
    enqueue: (...steps) => jobs.push(...steps),
    verify() { assert.deepEqual(errors, []); assert.equal(jobs.length, 0); },
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }),
  };
}
