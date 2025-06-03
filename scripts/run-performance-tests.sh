#!/bin/bash

# GuardAgent Performance Testing Script
# Sprint 1-C: Load Testing for 100 RPS requirement

set -e

echo "🚀 GuardAgent Performance Testing - Sprint 1-C"
echo "Target: <300ms p95 latency @ 100 RPS"
echo ""

# Configuration
BASE_URL=${BASE_URL:-http://localhost:8080}
RESULTS_DIR="perf/results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="$RESULTS_DIR/performance_report_$TIMESTAMP.json"
SUMMARY_FILE="$RESULTS_DIR/performance_summary_$TIMESTAMP.txt"

# Ensure results directory exists
mkdir -p "$RESULTS_DIR"

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo "❌ k6 is not installed. Please install k6 first:"
    echo "   - macOS: brew install k6"
    echo "   - Ubuntu: sudo apt install k6"
    echo "   - Windows: choco install k6"
    echo "   - Or download from: https://k6.io/docs/getting-started/installation/"
    exit 1
fi

echo "✅ k6 version: $(k6 version)"

# Check if server is running
echo "🔍 Checking if GuardAgent server is running..."
if curl -s "$BASE_URL/v1/health" > /dev/null; then
    echo "✅ Server is running at $BASE_URL"
else
    echo "❌ Server is not running at $BASE_URL"
    echo "Please start the server first: npm run dev"
    exit 1
fi

# Get server info
SERVER_INFO=$(curl -s "$BASE_URL/v1/health" | jq -r '.version // "unknown"' 2>/dev/null || echo "unknown")
echo "📊 Server version: $SERVER_INFO"

echo ""
echo "🏃‍♂️ Starting performance tests..."
echo "📈 Test configuration:"
echo "   - Target RPS: 100"
echo "   - Duration: ~6 minutes"
echo "   - Endpoints: 70% /guard, 20% /dsr, 10% /dpia"
echo "   - SLA: p95 < 300ms"
echo ""

# Run k6 performance test
echo "⚡ Executing k6 performance test..."
k6 run \
    --out json="$REPORT_FILE" \
    --env BASE_URL="$BASE_URL" \
    perf/guard_100rps.js

# Check if test completed successfully
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Performance test completed successfully!"
    
    # Generate summary report
    echo "📊 Generating performance summary..."
    
    # Extract key metrics from JSON report
    if [ -f "$REPORT_FILE" ]; then
        echo "Performance Test Summary - $(date)" > "$SUMMARY_FILE"
        echo "========================================" >> "$SUMMARY_FILE"
        echo "" >> "$SUMMARY_FILE"
        
        # Parse JSON results (basic parsing without jq dependency)
        echo "📈 Key Metrics:" >> "$SUMMARY_FILE"
        echo "- Test completed at: $(date)" >> "$SUMMARY_FILE"
        echo "- Target: p95 < 300ms @ 100 RPS" >> "$SUMMARY_FILE"
        echo "- Report file: $REPORT_FILE" >> "$SUMMARY_FILE"
        echo "" >> "$SUMMARY_FILE"
        
        # Display summary
        cat "$SUMMARY_FILE"
        
        echo ""
        echo "📁 Results saved to:"
        echo "   - JSON Report: $REPORT_FILE"
        echo "   - Summary: $SUMMARY_FILE"
        
        # Check if we have jq for detailed analysis
        if command -v jq &> /dev/null; then
            echo ""
            echo "🔍 Detailed Analysis:"
            
            # Extract p95 latency
            P95_LATENCY=$(cat "$REPORT_FILE" | jq -r '.metrics.http_req_duration.values."p(95)"' 2>/dev/null || echo "N/A")
            TOTAL_REQUESTS=$(cat "$REPORT_FILE" | jq -r '.metrics.http_reqs.values.count' 2>/dev/null || echo "N/A")
            ERROR_RATE=$(cat "$REPORT_FILE" | jq -r '.metrics.http_req_failed.values.rate' 2>/dev/null || echo "N/A")
            
            echo "   - Total Requests: $TOTAL_REQUESTS"
            echo "   - P95 Latency: ${P95_LATENCY}ms"
            echo "   - Error Rate: $(echo "$ERROR_RATE * 100" | bc 2>/dev/null || echo "N/A")%"
            
            # Check SLA compliance
            if [ "$P95_LATENCY" != "N/A" ]; then
                if (( $(echo "$P95_LATENCY < 300" | bc -l) )); then
                    echo "   - SLA Status: ✅ PASSED (p95 < 300ms)"
                else
                    echo "   - SLA Status: ❌ FAILED (p95 >= 300ms)"
                fi
            fi
        else
            echo "💡 Install jq for detailed metrics analysis: apt install jq / brew install jq"
        fi
        
    else
        echo "⚠️ Report file not found: $REPORT_FILE"
    fi
    
    echo ""
    echo "🎯 Sprint 1-C Performance Gate:"
    echo "   - Target: p95 < 300ms @ 100 RPS"
    echo "   - Status: Check detailed analysis above"
    echo ""
    echo "📋 Next steps if SLA failed:"
    echo "   1. Enable async logging: set ASYNC_LOGGING=true"
    echo "   2. Increase batch size: set LOG_BATCH_SIZE=100"
    echo "   3. Add circuit breakers to PI guard"
    echo "   4. Optimize database queries"
    echo ""
    
else
    echo ""
    echo "❌ Performance test failed!"
    echo "Check the k6 output above for error details."
    exit 1
fi

echo "🏁 Performance testing complete!"
echo "📊 View detailed results in: $RESULTS_DIR/"
