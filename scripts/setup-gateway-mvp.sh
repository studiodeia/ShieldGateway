#!/bin/bash

# GuardAgent Gateway MVP - Setup Script
# This script creates the gateway-mvp branch and sets up the development environment

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in a git repository
check_git_repo() {
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log_error "Not in a git repository. Please run this script from the GuardAgent Core repository root."
        exit 1
    fi
}

# Check if main branch exists and is up to date
check_main_branch() {
    log_info "Checking main branch status..."
    
    if ! git show-ref --verify --quiet refs/heads/main; then
        log_error "Main branch not found. Please ensure you're in the correct repository."
        exit 1
    fi
    
    # Switch to main branch
    git checkout main
    
    # Check for uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        log_warning "You have uncommitted changes. Please commit or stash them before proceeding."
        read -p "Do you want to continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    log_success "Main branch is ready"
}

# Create platform base tag
create_platform_tag() {
    log_info "Creating platform base tag..."
    
    # Check if tag already exists
    if git tag -l | grep -q "v0.3.1-platform-base"; then
        log_warning "Tag v0.3.1-platform-base already exists"
    else
        git tag v0.3.1-platform-base
        log_success "Created tag v0.3.1-platform-base"
    fi
}

# Create gateway-mvp branch
create_gateway_branch() {
    log_info "Creating gateway-mvp branch..."
    
    # Check if branch already exists
    if git show-ref --verify --quiet refs/heads/feature/gateway-mvp; then
        log_warning "Branch feature/gateway-mvp already exists"
        read -p "Do you want to delete and recreate it? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git branch -D feature/gateway-mvp
            log_info "Deleted existing branch"
        else
            log_info "Using existing branch"
            git checkout feature/gateway-mvp
            return
        fi
    fi
    
    # Create new branch from main
    git checkout -b feature/gateway-mvp
    
    # Create gateway base tag
    git tag v0.3.1-gateway-base
    
    log_success "Created branch feature/gateway-mvp with tag v0.3.1-gateway-base"
}

# Create gateway-specific configuration
create_gateway_config() {
    log_info "Creating gateway-specific configuration..."
    
    # Create gateway environment file
    cat > .env.gateway << EOF
# GuardAgent Gateway MVP Configuration

# Application
NODE_ENV=development
PORT=8080
HOST=0.0.0.0

# Gateway Mode
GATEWAY_MODE=true
PRODUCT_NAME="GuardAgent Gateway"

# Database
DATABASE_URL=postgresql://guardagent:dev_password@localhost:5432/guardagent_gateway

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# Authentication
JWT_SECRET=dev_jwt_secret_change_in_production
API_KEY_SECRET=dev_api_key_secret_change_in_production

# Feature Flags (Gateway MVP)
FEATURES_VAULT_ENABLED=false
FEATURES_WORM_LOGGING=false
FEATURES_COMPLEX_RBAC=false
FEATURES_MAIL_SERVICE=false
FEATURES_KEY_ROTATION=false
FEATURES_DPIA_GENERATION=false

# Simplified Features
FEATURES_SIMPLE_RISK_ENGINE=true
FEATURES_TIER_SYSTEM=true
FEATURES_SELF_SERVICE=true
FEATURES_WEBHOOKS=true

# Logging
LOG_LEVEL=debug
LOG_RETENTION_DAYS=30
LOG_INCLUDE_CONTENT=false

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=1000

# Tiers
DEFAULT_TIER=free
TIER_CONFIG_PATH=./config/tiers.yaml

# Performance
NODE_OPTIONS="--max-old-space-size=512"
UV_THREADPOOL_SIZE=8

# Monitoring
METRICS_ENABLED=true
HEALTH_CHECK_ENABLED=true

# External Services (disabled for MVP)
SENDGRID_API_KEY=
VAULT_ADDR=
AWS_REGION=us-east-1
EOF

    log_success "Created .env.gateway configuration file"
}

# Create gateway-specific package.json scripts
update_package_scripts() {
    log_info "Adding gateway-specific npm scripts..."
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        log_error "package.json not found"
        return 1
    fi
    
    # Create backup
    cp package.json package.json.backup
    
    # Add gateway scripts using jq if available, otherwise manual
    if command -v jq &> /dev/null; then
        jq '.scripts += {
            "dev:gateway": "NODE_ENV=development tsx src/index.ts",
            "build:gateway": "tsc && cp -r public dist/ && cp -r config dist/",
            "start:gateway": "NODE_ENV=production node dist/index.js",
            "docker:gateway": "docker-compose -f docker-compose.gateway.yml up -d",
            "docker:gateway:build": "docker build -f Dockerfile.gateway -t guardagent/gateway:latest .",
            "test:gateway": "jest --config jest.gateway.config.js",
            "lint:gateway": "eslint src --ext .ts --fix"
        }' package.json > package.json.tmp && mv package.json.tmp package.json
        
        log_success "Added gateway scripts to package.json"
    else
        log_warning "jq not found. Please manually add gateway scripts to package.json"
    fi
}

# Create gateway-specific directories
create_gateway_directories() {
    log_info "Creating gateway-specific directories..."
    
    # Create directories
    mkdir -p config/tiers
    mkdir -p config/policies/gateway
    mkdir -p public/js
    mkdir -p public/css
    mkdir -p public/images
    mkdir -p scripts/gateway
    mkdir -p docs/gateway
    mkdir -p nginx
    
    log_success "Created gateway directory structure"
}

# Create initial gateway documentation
create_gateway_docs() {
    log_info "Creating initial gateway documentation..."
    
    cat > README.gateway.md << EOF
# GuardAgent Gateway MVP

A simplified, developer-friendly version of GuardAgent Core designed for self-service onboarding and freemium monetization.

## Quick Start

\`\`\`bash
# Install dependencies
npm install

# Start development server
npm run dev:gateway

# Or use Docker
npm run docker:gateway
\`\`\`

## Environment Setup

1. Copy the gateway environment file:
   \`\`\`bash
   cp .env.gateway .env
   \`\`\`

2. Update database and Redis URLs if needed

3. Start the services:
   \`\`\`bash
   docker-compose -f docker-compose.gateway.yml up -d
   \`\`\`

## Features

- ✅ Prompt injection detection
- ✅ PII detection and masking (tier-based)
- ✅ Self-service onboarding
- ✅ Tier-based feature flags
- ✅ Simple risk scoring (0-1)
- ✅ Webhooks for alerts
- ❌ Vault/KMS integration (simplified)
- ❌ WORM logging (basic S3)
- ❌ Complex RBAC (owner-only)

## API Endpoints

- \`POST /v1/guard\` - Content analysis
- \`GET /v1/health\` - Health check
- \`POST /start/signup\` - Self-service signup
- \`GET /dashboard\` - User dashboard

## Tiers

- **Free**: 1K requests/month, basic features
- **Starter**: \$29/month, 10K requests, PII masking
- **Pro**: \$99/month, 100K requests, webhooks + analytics

## Documentation

- [Architecture](./GATEWAY_MVP_SCOPE.md)
- [Tier System](./TIER_ARCHITECTURE.md)
- [Onboarding](./ONBOARDING_PLAN.md)
- [Branching Strategy](./BRANCHING_STRATEGY.md)

## Development

See [Sprint G-0 to G-4 documentation](./GATEWAY_MVP_PLAN.md) for detailed implementation plan.
EOF

    log_success "Created README.gateway.md"
}

# Setup git hooks for gateway development
setup_git_hooks() {
    log_info "Setting up git hooks for gateway development..."
    
    mkdir -p .git/hooks
    
    # Pre-commit hook
    cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# GuardAgent Gateway - Pre-commit hook

# Check if we're on gateway-mvp branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ $BRANCH == "feature/gateway-mvp" ]]; then
    echo "Running gateway-specific pre-commit checks..."
    
    # Run linting
    npm run lint:gateway
    
    # Run gateway tests
    npm run test:gateway
    
    echo "Gateway pre-commit checks passed ✅"
fi
EOF

    chmod +x .git/hooks/pre-commit
    
    log_success "Set up git hooks"
}

# Push branches and tags to remote
push_to_remote() {
    log_info "Pushing branches and tags to remote..."
    
    read -p "Do you want to push to remote origin? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Push main branch and platform tag
        git checkout main
        git push origin main
        git push origin v0.3.1-platform-base
        
        # Push gateway branch and tag
        git checkout feature/gateway-mvp
        git push origin feature/gateway-mvp
        git push origin v0.3.1-gateway-base
        
        log_success "Pushed branches and tags to remote"
    else
        log_info "Skipped pushing to remote"
    fi
}

# Display next steps
show_next_steps() {
    echo
    log_success "Gateway MVP setup completed! 🎉"
    echo
    echo "Next steps:"
    echo "1. Review the created configuration files:"
    echo "   - .env.gateway"
    echo "   - README.gateway.md"
    echo "   - Gateway documentation files"
    echo
    echo "2. Start development:"
    echo "   npm install"
    echo "   npm run dev:gateway"
    echo
    echo "3. Or use Docker:"
    echo "   npm run docker:gateway"
    echo
    echo "4. Access the application:"
    echo "   - Landing page: http://localhost:8080"
    echo "   - Health check: http://localhost:8080/v1/health"
    echo "   - Dashboard: http://localhost:8080/dashboard"
    echo
    echo "5. Follow the Sprint G-1 to G-4 implementation plan in:"
    echo "   GATEWAY_MVP_PLAN.md"
    echo
    log_info "Happy coding! 🚀"
}

# Main execution
main() {
    echo "🛡️  GuardAgent Gateway MVP Setup"
    echo "=================================="
    echo
    
    check_git_repo
    check_main_branch
    create_platform_tag
    create_gateway_branch
    create_gateway_config
    update_package_scripts
    create_gateway_directories
    create_gateway_docs
    setup_git_hooks
    push_to_remote
    show_next_steps
}

# Run main function
main "$@"
