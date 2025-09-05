#!/usr/bin/env node

import { WorkflowManager, WorkflowContext } from '../src/workflowmanager';

// Test the substituteVariables function
const workflowManager = new WorkflowManager();

const testContext: WorkflowContext = {
  containerName: 'test-container',
  docker: null as any,
  args: {
    'VAR1': 'value1',
    'EMPTY_VAR': '',
    'UNDEFINED_VAR': undefined as any,
    'READ_ONLY': 'true',
    'SUB_PATH': 'bot-instances'
  },
  files: {},
  env: {
    'ENV_VAR': 'env_value',
    'EMPTY_ENV': ''
  },
  user: 'testuser',
  workdir: '/workspace'
};

console.log('Testing substituteVariables function:');
console.log('=====================================');

// Test cases
const testCases = [
  { input: '${VAR1}', expected: 'value1' },
  { input: '${ENV_VAR}', expected: 'env_value' },
  { input: '${VAR1:-default}', expected: 'value1' },
  { input: '${UNDEFINED_VAR:-default}', expected: 'default' },
  { input: '${EMPTY_VAR:-default}', expected: 'default' },
  { input: '${VAR1:+present}', expected: 'present' },
  { input: '${UNDEFINED_VAR:+present}', expected: '' },
  { input: '${EMPTY_VAR:+present}', expected: '' },
  { input: '${VAR1} and ${ENV_VAR}', expected: 'value1 and env_value' },
  { input: '${UNDEFINED_VAR:-fallback} and ${VAR1:+success}', expected: 'fallback and success' },
  { input: '${READ_ONLY:+-o ro}', expected: '-o ro' },
  { input: '${UNDEFINED_VAR:+-o ro}', expected: '' },
  { input: '${READ_ONLY:+-o ro} --uid=1001', expected: '-o ro --uid=1001' },
  { input: '${SUB_PATH:+--only-dir ${SUB_PATH}}', expected: '--only-dir bot-instances' },
  { input: '${UNDEFINED_SUB_PATH:+--only-dir ${UNDEFINED_SUB_PATH}}', expected: '' },
  { input: 'gcsfuse ${READ_ONLY:+-o ro} --uid=${NON_ROOT_UID} --gid=${NON_ROOT_GID} -o allow_other ${SUB_PATH:+--only-dir ${SUB_PATH}} ${BUCKET_NAME} ${MOUNT_POINT}', expected: 'gcsfuse -o ro --uid= --gid= -o allow_other --only-dir bot-instances  ' }
];

testCases.forEach(({ input, expected }, index) => {
  const result = (workflowManager as any).substituteVariables(input, testContext);
  const passed = result === expected;
  console.log(`Test ${index + 1}: ${input}`);
  console.log(`  Expected: "${expected}"`);
  console.log(`  Got:      "${result}"`);
  console.log(`  ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
});

console.log('Testing complete.');