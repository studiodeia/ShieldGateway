#!/bin/bash

# GuardAgent Sprint 1-C "Green Gate" Criteria Checker
# Validates all requirements before design-partner release

set -e

echo "🎯 GuardAgent Sprint 1-C 'Green Gate' Criteria Checker"
echo "======================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Helper functions
check_pass() {
    echo -e "✅ ${GREEN}PASS${NC}: $1"
    ((PASSED++))
}

check_fail() {
    echo -e "❌ ${RED}FAIL${NC}: $1"
    ((FAILED++))
}

check_warn() {
    echo -e "⚠️ ${YELLOW}WARN${NC}: $1"
    ((WARNINGS++))
}

# 1. S3 Compliance Mode Check
echo "🔒 1. S3 Compliance Mode + MFA-Delete"
echo "------------------------------------"

if grep -q "COMPLIANCE" terraform/s3-worm-bucket.tf; then
    check_pass "S3 bucket configured for COMPLIANCE mode"
else
    check_fail "S3 bucket not configured for COMPLIANCE mode"
fi

if grep -q "mfa.*ENABLED" terraform/s3-worm-bucket.tf; then
    check_pass "MFA-Delete configuration found"
else
    check_fail "MFA-Delete not configured"
fi

echo ""

# 2. DSR PostgreSQL Persistence
echo "🗄️ 2. DSR PostgreSQL Persistence"
echo "--------------------------------"

if [ -f "src/config/database.ts" ]; then
    check_pass "Database configuration file exists"
else
    check_fail "Database configuration file missing"
fi

if [ -f "src/entities/DSRTicket.ts" ]; then
    check_pass "DSR entity definition exists"
else
    check_fail "DSR entity definition missing"
fi

if [ -f "src/migrations/20250602_create_dsr_tickets.ts" ]; then
    check_pass "Database migration file exists"
else
    check_fail "Database migration file missing"
fi

if grep -q "typeorm" package.json; then
    check_pass "TypeORM dependency installed"
else
    check_fail "TypeORM dependency missing"
fi

echo ""

# 3. Load Testing Infrastructure
echo "⚡ 3. Load Testing (100 RPS)"
echo "---------------------------"

if [ -f "perf/guard_100rps.js" ]; then
    check_pass "k6 performance test script exists"
else
    check_fail "k6 performance test script missing"
fi

if grep -q "perf:test" package.json; then
    check_pass "Performance test npm script configured"
else
    check_fail "Performance test npm script missing"
fi

if [ -f "scripts/run-performance-tests.sh" ]; then
    check_pass "Performance test runner script exists"
else
    check_fail "Performance test runner script missing"
fi

# Check if k6 is available
if command -v k6 &> /dev/null; then
    check_pass "k6 is installed and available"
else
    check_warn "k6 not installed (required for performance testing)"
fi

echo ""

# 4. Test Coverage
echo "🧪 4. Test Coverage (70%+)"
echo "-------------------------"

if [ -f "jest.config.js" ]; then
    if grep -q "70" jest.config.js; then
        check_pass "Jest configured with 70% coverage threshold"
    else
        check_fail "Jest coverage threshold not set to 70%"
    fi
else
    check_fail "Jest configuration file missing"
fi

# Count test files
TEST_COUNT=$(find tests -name "*.test.ts" | wc -l)
if [ "$TEST_COUNT" -ge 5 ]; then
    check_pass "Sufficient test files found ($TEST_COUNT files)"
else
    check_warn "Limited test files found ($TEST_COUNT files)"
fi

# Check for E2E tests
if [ -d "tests/e2e" ]; then
    E2E_COUNT=$(find tests/e2e -name "*.test.ts" | wc -l)
    if [ "$E2E_COUNT" -ge 2 ]; then
        check_pass "E2E tests implemented ($E2E_COUNT files)"
    else
        check_warn "Limited E2E test coverage ($E2E_COUNT files)"
    fi
else
    check_fail "E2E tests directory missing"
fi

echo ""

# 5. PT-BR Corpus Expansion
echo "🇧🇷 5. PT-BR Corpus (300+ payloads)"
echo "----------------------------------"

if [ -f "src/data/prompt-injection-payloads-extended.ts" ]; then
    check_pass "Extended payload corpus file exists"
else
    check_fail "Extended payload corpus file missing"
fi

# Count payloads in extended file
if [ -f "src/data/prompt-injection-payloads-extended.ts" ]; then
    PAYLOAD_COUNT=$(grep -c "id: 'PI-BR-" src/data/prompt-injection-payloads-extended.ts || echo "0")
    if [ "$PAYLOAD_COUNT" -ge 200 ]; then
        check_pass "Extended corpus has $PAYLOAD_COUNT payloads"
    else
        check_warn "Extended corpus has only $PAYLOAD_COUNT payloads (target: 200+)"
    fi
fi

# Check for advanced obfuscation techniques
if grep -q "unicode_obfuscation" src/services/PromptInjectionGuard.ts; then
    check_pass "Unicode obfuscation detection implemented"
else
    check_fail "Unicode obfuscation detection missing"
fi

if grep -q "calculateSemanticDistance" src/services/PromptInjectionGuard.ts; then
    check_pass "Semantic distance detection implemented"
else
    check_fail "Semantic distance detection missing"
fi

echo ""

# 6. OpenAPI 3.1 Documentation
echo "📚 6. OpenAPI 3.1 Documentation"
echo "------------------------------"

if [ -f "src/config/swagger.ts" ]; then
    check_pass "Swagger configuration exists"
else
    check_fail "Swagger configuration missing"
fi

if [ -f "src/routes/docs.ts" ]; then
    check_pass "Documentation routes exist"
else
    check_fail "Documentation routes missing"
fi

if grep -q "swagger-jsdoc" package.json; then
    check_pass "Swagger dependencies installed"
else
    check_fail "Swagger dependencies missing"
fi

if grep -q "openapi.*3.1" src/config/swagger.ts; then
    check_pass "OpenAPI 3.1 specification configured"
else
    check_warn "OpenAPI version not explicitly set to 3.1"
fi

echo ""

# 7. Code Quality and Dependencies
echo "🔧 7. Code Quality & Dependencies"
echo "--------------------------------"

# Check TypeScript compilation
if npm run build &>/dev/null; then
    check_pass "TypeScript compilation successful"
else
    check_fail "TypeScript compilation failed"
fi

# Check for required dependencies
REQUIRED_DEPS=("typeorm" "pg" "swagger-jsdoc" "swagger-ui-express")
for dep in "${REQUIRED_DEPS[@]}"; do
    if grep -q "\"$dep\"" package.json; then
        check_pass "Required dependency '$dep' installed"
    else
        check_fail "Required dependency '$dep' missing"
    fi
done

echo ""

# 8. Environment Configuration
echo "🌍 8. Environment Configuration"
echo "------------------------------"

if [ -f ".env.example" ]; then
    check_pass "Environment example file exists"
else
    check_warn "Environment example file missing"
fi

# Check for database environment variables in code
if grep -q "DB_HOST" src/config/database.ts; then
    check_pass "Database environment variables configured"
else
    check_fail "Database environment variables not configured"
fi

echo ""

# Summary
echo "📊 SPRINT 1-C CRITERIA SUMMARY"
echo "=============================="
echo ""
echo -e "✅ ${GREEN}PASSED${NC}: $PASSED"
echo -e "❌ ${RED}FAILED${NC}: $FAILED"
echo -e "⚠️ ${YELLOW}WARNINGS${NC}: $WARNINGS"
echo ""

# Determine gate status
if [ "$FAILED" -eq 0 ]; then
    if [ "$WARNINGS" -eq 0 ]; then
        echo -e "🎉 ${GREEN}GREEN GATE: ALL CRITERIA MET${NC}"
        echo "✅ Ready for design-partner pilots!"
    else
        echo -e "🟡 ${YELLOW}YELLOW GATE: MINOR ISSUES${NC}"
        echo "⚠️ Address warnings before production release"
    fi
    EXIT_CODE=0
else
    echo -e "🔴 ${RED}RED GATE: CRITICAL ISSUES${NC}"
    echo "❌ Must fix failed criteria before design-partner release"
    EXIT_CODE=1
fi

echo ""
echo "📋 Next Steps:"
if [ "$FAILED" -gt 0 ]; then
    echo "1. Fix all failed criteria above"
    echo "2. Re-run this checker: ./scripts/check-sprint-1c-criteria.sh"
    echo "3. Run performance tests: ./scripts/run-performance-tests.sh"
    echo "4. Verify test coverage: npm run test:coverage"
else
    echo "1. Run performance tests: ./scripts/run-performance-tests.sh"
    echo "2. Verify test coverage: npm run test:coverage"
    echo "3. Deploy to staging environment"
    echo "4. Schedule design-partner demos"
fi

echo ""
echo "📚 Documentation:"
echo "- API Docs: http://localhost:8080/docs"
echo "- Health Check: http://localhost:8080/v1/health"
echo "- Metrics: http://localhost:8080/metrics"

exit $EXIT_CODE
