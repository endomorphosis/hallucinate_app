#!/bin/bash
# Database Backup System Test Runner

# Set colors for output
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
RESET="\033[0m"
BOLD="\033[1m"

echo -e "${BOLD}Running Database Backup System Tests${RESET}"
echo "======================================"

# Change to the project root directory
cd "$(dirname "$0")/.."

# Create test results directory if it doesn't exist
mkdir -p test/results

# Run JavaScript tests
echo -e "\n${YELLOW}Running JavaScript Tests${RESET}"
echo "-------------------------------------"
npm run test:database-backup:js
JS_RESULT=$?

if [ $JS_RESULT -eq 0 ]; then
  echo -e "\n${GREEN}✓ JavaScript tests passed${RESET}"
else
  echo -e "\n${RED}✗ JavaScript tests failed${RESET}"
fi

# Run Python tests
echo -e "\n${YELLOW}Running Python Tests${RESET}"
echo "-------------------------------------"
npm run test:database-backup:py
PY_RESULT=$?

if [ $PY_RESULT -eq 0 ]; then
  echo -e "\n${GREEN}✓ Python tests passed${RESET}"
else
  echo -e "\n${RED}✗ Python tests failed${RESET}"
fi

# Output final result
echo -e "\n${BOLD}Test Results Summary${RESET}"
echo "======================================"

if [ $JS_RESULT -eq 0 ] && [ $PY_RESULT -eq 0 ]; then
  echo -e "${GREEN}All database backup tests passed!${RESET}"
  exit 0
else
  echo -e "${RED}Some database backup tests failed!${RESET}"
  echo -e "JavaScript tests: $([ $JS_RESULT -eq 0 ] && echo "${GREEN}PASS${RESET}" || echo "${RED}FAIL${RESET}")"
  echo -e "Python tests: $([ $PY_RESULT -eq 0 ] && echo "${GREEN}PASS${RESET}" || echo "${RED}FAIL${RESET}")"
  exit 1
fi