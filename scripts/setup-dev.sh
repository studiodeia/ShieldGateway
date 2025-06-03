#!/bin/bash

# GuardAgent Development Environment Setup Script
# Sprint 1-C: Green Gate Implementation

set -e

echo "🚀 Setting up GuardAgent Development Environment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node --version)"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check if PostgreSQL is available
if command -v psql &> /dev/null; then
    echo "✅ PostgreSQL is available"
    
    # Create development database if it doesn't exist
    echo "🗄️ Setting up development database..."
    createdb guardagent_tickets_dev 2>/dev/null || echo "Database already exists"
    
    # Set environment variables for development
    export DB_HOST=localhost
    export DB_PORT=5432
    export DB_USERNAME=postgres
    export DB_PASSWORD=postgres
    export DB_NAME=guardagent_tickets_dev
    export NODE_ENV=development
else
    echo "⚠️ PostgreSQL not found. Using SQLite for development."
    export NODE_ENV=development
fi

# Check if k6 is installed for performance testing
if command -v k6 &> /dev/null; then
    echo "✅ k6 is available for performance testing"
else
    echo "⚠️ k6 not found. Install k6 for performance testing:"
    echo "   - macOS: brew install k6"
    echo "   - Ubuntu: sudo apt install k6"
    echo "   - Windows: choco install k6"
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p perf/results
mkdir -p logs
mkdir -p docs/security

# Build the project
echo "🔨 Building project..."
npm run build

# Run tests to verify setup
echo "🧪 Running tests to verify setup..."
npm test

# Check test coverage
echo "📊 Checking test coverage..."
npm run test:coverage

echo ""
echo "🎉 Development environment setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Start the development server: npm run dev"
echo "   2. Run performance tests: npm run perf:test-local"
echo "   3. View API documentation: http://localhost:8080/docs"
echo "   4. Check health: http://localhost:8080/v1/health"
echo ""
echo "🔧 Environment variables:"
echo "   DB_HOST=${DB_HOST:-localhost}"
echo "   DB_NAME=${DB_NAME:-guardagent_tickets_dev}"
echo "   NODE_ENV=${NODE_ENV:-development}"
echo ""
echo "📚 Documentation:"
echo "   - API Docs: http://localhost:8080/docs"
echo "   - OpenAPI Spec: http://localhost:8080/docs/openapi.json"
echo "   - Metrics: http://localhost:8080/metrics"
