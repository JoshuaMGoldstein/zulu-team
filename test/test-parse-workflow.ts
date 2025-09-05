import { WorkflowManager, WorkflowStep } from '../src/workflowmanager';
import * as fs from 'fs';
import * as path from 'path';

const workflowManager = new WorkflowManager();

const workflowPath = path.join(__dirname, '../workflows/mount-gcs.workflow');

if (!fs.existsSync(workflowPath)) {
  console.error(`Workflow file not found: ${workflowPath}`);
  process.exit(1);
}

const content = fs.readFileSync(workflowPath, 'utf-8');

console.log('Parsing workflow content from workflows/mount-gcs.workflow:');
console.log('=======================================================');

const steps: WorkflowStep[] = workflowManager.parseWorkflow(content);

console.log('Parsed Steps:');
steps.forEach((step, index) => {
  console.log(`Step ${index + 1}:`);
  console.log(`  Type: ${step.type}`);
  console.log(`  Args: ${JSON.stringify(step.args)}`);
});

console.log('=======================================================');
console.log('Workflow parsing complete.');
