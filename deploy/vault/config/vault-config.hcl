# HashiCorp Vault Configuration for GuardAgent
# Production-ready configuration with AWS KMS auto-unseal

# Storage backend - using integrated storage (Raft)
storage "raft" {
  path    = "/vault/data"
  node_id = "vault-node-1"
  
  # Retry join for HA setup
  retry_join {
    leader_api_addr = "https://vault-0.vault-internal:8200"
  }
  retry_join {
    leader_api_addr = "https://vault-1.vault-internal:8200"
  }
  retry_join {
    leader_api_addr = "https://vault-2.vault-internal:8200"
  }
}

# Listener configuration
listener "tcp" {
  address       = "0.0.0.0:8200"
  tls_cert_file = "/vault/tls/vault.crt"
  tls_key_file  = "/vault/tls/vault.key"
  
  # Security headers
  tls_min_version = "tls12"
  tls_cipher_suites = "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384"
  
  # Client certificate authentication (optional)
  tls_require_and_verify_client_cert = false
  
  # Disable HTTP/2 for better compatibility
  http_read_timeout = "30s"
  http_write_timeout = "30s"
  http_idle_timeout = "5m"
}

# AWS KMS Auto-unseal
seal "awskms" {
  region     = "us-east-1"
  kms_key_id = "arn:aws:kms:us-east-1:ACCOUNT-ID:key/KMS-KEY-ID"
  endpoint   = "https://kms.us-east-1.amazonaws.com"
}

# API address for cluster communication
api_addr = "https://vault.guardagent-internal:8200"
cluster_addr = "https://vault.guardagent-internal:8201"

# Cluster name
cluster_name = "guardagent-vault-cluster"

# UI configuration
ui = true

# Logging
log_level = "INFO"
log_format = "json"

# Disable mlock for containerized environments
disable_mlock = true

# Performance tuning
default_lease_ttl = "768h"  # 32 days
max_lease_ttl = "8760h"     # 1 year

# Telemetry (optional - for monitoring)
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname = true
  
  # Uncomment for Datadog integration
  # dogstatsd_addr = "localhost:8125"
  # dogstatsd_tags = ["vault", "guardagent"]
}

# Plugin directory
plugin_directory = "/vault/plugins"

# Cache size (adjust based on available memory)
cache_size = "32000"

# Entropy augmentation (for better randomness)
entropy "seal" {
  mode = "augmentation"
}
