import hostedWorkflow from './hosted-workflow.mjs';
// Emits code only. No browser or network calls and no auth material involved.
const options=JSON.parse(process.argv[2]||'{}');
process.stdout.write(`(${hostedWorkflow.toString()})(${JSON.stringify(options)})`);
