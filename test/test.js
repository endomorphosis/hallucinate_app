import { TestAccelerateBridge } from './js/test_accelerate_bridge.js';
import { MockApp } from './js/test_accelerate_electron.js';
import fs from 'fs';
import path from 'path';

class TestRunner {
  constructor() {
    this.testResults = {};
  }
  
  async runTests() {
    try {
      // Run bridge tests
      console.log('\n===== Running Accelerate Bridge Tests =====');
      const bridgeTester = new TestAccelerateBridge();
      this.testResults.bridge = await bridgeTester.test();
      
      // Run electron app tests
      console.log('\n===== Running Accelerate Electron Tests =====');
      const appTester = new MockApp();
      this.testResults.electron = await appTester.test();
      appTester.cleanup();
      
      // Save test results
      const testResultsFile = path.join(process.cwd(), 'test', 'test_results.json');
      fs.writeFileSync(
        testResultsFile, 
        JSON.stringify(this.testResults, null, 2)
      );
      
      console.log('\n===== Test Results Summary =====');
      console.log(JSON.stringify(this.testResults, null, 2));
      
      // Generate test report markdown
      let report = '# IPFS Accelerate Tests Report\n\n';
      
      report += '## Bridge Tests\n\n';
      report += '| Test | Result |\n';
      report += '|------|--------|\n';
      for (const [testName, result] of Object.entries(this.testResults.bridge)) {
        report += `| ${testName.replace(/_/g, ' ')} | ${result ? '✅ PASS' : '❌ FAIL'} |\n`;
      }
      
      report += '\n## Electron App Tests\n\n';
      report += '| Test | Result |\n';
      report += '|------|--------|\n';
      for (const [testName, result] of Object.entries(this.testResults.electron)) {
        report += `| ${testName.replace(/_/g, ' ')} | ${result ? '✅ PASS' : '❌ FAIL'} |\n`;
      }
      
      fs.writeFileSync(
        path.join(process.cwd(), 'test', 'TEST_REPORT.md'),
        report
      );
      
      // Determine overall success based on all tests
      const allBridgePassed = Object.values(this.testResults.bridge).every(r => r === true);
      const allElectronPassed = Object.values(this.testResults.electron).every(r => r === true);
      
      return allBridgePassed && allElectronPassed;
    } catch (error) {
      console.error('Error running tests:', error);
      return false;
    }
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Starting IPFS Accelerate tests...');
  const runner = new TestRunner();
  runner.runTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}