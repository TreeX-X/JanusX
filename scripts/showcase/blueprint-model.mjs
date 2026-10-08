// Note: deterministic local model, real host tools — see .agents/notes/desktop/readme-showcase.md
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

export async function blueprintModel() {
  const jobs = [], calls = [], errors = [];
  const server = createServer(async (request, response) => {
    try {
      if (request.method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ data: [{ id: 'demo-model', object: 'model' }] })); return;
      }
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body.stream) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }] })); return;
      }
      assert.equal(request.url, '/v1/responses');
      const job = jobs.shift(); assert.ok(job, 'Unexpected model request');
      if (job.tool) assert.ok(body.tools.some(tool => tool.name === job.tool), `Tool unavailable: ${job.tool}`);
      const id = `demo-${calls.length}`; calls.push(job.tool ?? 'reply');
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const emit = event => response.write(`data: ${JSON.stringify(event)}\n\n`);
      emit({ type: 'response.created', response: { id, created_at: 1, model: 'demo-model' } });
      if (job.tool) {
        const item = { type: 'function_call', id, call_id: id, name: job.tool, arguments: JSON.stringify(job.args), status: 'completed' };
        emit({ type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '' } });
        emit({ type: 'response.function_call_arguments.delta', item_id: id, output_index: 0, delta: item.arguments });
        emit({ type: 'response.output_item.done', output_index: 0, item });
      } else {
        const item = { type: 'message', id };
        emit({ type: 'response.output_item.added', output_index: 0, item });
        emit({ type: 'response.output_text.delta', item_id: id, delta: job.text });
        emit({ type: 'response.output_item.done', output_index: 0, item });
      }
      emit({ type: 'response.completed', response: { usage: { input_tokens: 100, output_tokens: 30 } } }); response.end();
    } catch (error) {
      errors.push(String(error)); console.error(String(error));
      if (!response.headersSent) response.writeHead(500); response.end('Demo model failed');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { baseURL: `http://127.0.0.1:${server.address().port}/v1`, calls, errors,
    enqueue: (...steps) => jobs.push(...steps), verify: () => { assert.deepEqual(errors, []); assert.equal(jobs.length, 0); },
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }),
  };
}
