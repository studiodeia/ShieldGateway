# Terraform configuration for GuardAgent WORM logging S3 buckets
# This creates two buckets: dev (no legal hold) and prod (Object-Lock Compliance ON)

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment (dev, prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "guardagent"
}

# Development bucket (no Object-Lock for easier testing)
resource "aws_s3_bucket" "guardagent_dev_logs" {
  count  = var.environment == "dev" ? 1 : 0
  bucket = "${var.project_name}-dev-logs"

  tags = {
    Name        = "GuardAgent Dev Logs"
    Environment = "dev"
    Purpose     = "WORM logging for development"
  }
}

resource "aws_s3_bucket_versioning" "guardagent_dev_logs" {
  count  = var.environment == "dev" ? 1 : 0
  bucket = aws_s3_bucket.guardagent_dev_logs[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "guardagent_dev_logs" {
  count  = var.environment == "dev" ? 1 : 0
  bucket = aws_s3_bucket.guardagent_dev_logs[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Production bucket (Object-Lock Compliance ON)
resource "aws_s3_bucket" "guardagent_prod_logs" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = "${var.project_name}-prod-logs"

  object_lock_enabled = true

  tags = {
    Name        = "GuardAgent Prod Logs"
    Environment = "prod"
    Purpose     = "WORM logging for production"
    Compliance  = "LGPD-GDPR"
    MFADelete   = "Required"
  }
}

# Enable MFA Delete for production bucket
resource "aws_s3_bucket_mfa_delete" "guardagent_prod_logs" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = aws_s3_bucket.guardagent_prod_logs[0].id
  mfa    = "ENABLED"
}

resource "aws_s3_bucket_versioning" "guardagent_prod_logs" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = aws_s3_bucket.guardagent_prod_logs[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "guardagent_prod_logs" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = aws_s3_bucket.guardagent_prod_logs[0].id

  rule {
    default_retention {
      mode = "COMPLIANCE"
      days = 365
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "guardagent_prod_logs" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = aws_s3_bucket.guardagent_prod_logs[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# IAM role for GuardAgent application
resource "aws_iam_role" "guardagent_role" {
  name = "${var.project_name}-${var.environment}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "GuardAgent ${title(var.environment)} Role"
    Environment = var.environment
  }
}

# IAM policy for S3 access
resource "aws_iam_role_policy" "guardagent_s3_policy" {
  name = "${var.project_name}-${var.environment}-s3-policy"
  role = aws_iam_role.guardagent_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectLegalHold",
          "s3:PutObjectRetention",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          var.environment == "dev" ? aws_s3_bucket.guardagent_dev_logs[0].arn : aws_s3_bucket.guardagent_prod_logs[0].arn,
          "${var.environment == "dev" ? aws_s3_bucket.guardagent_dev_logs[0].arn : aws_s3_bucket.guardagent_prod_logs[0].arn}/*"
        ]
      }
    ]
  })
}

# Outputs
output "bucket_name" {
  description = "Name of the created S3 bucket"
  value       = var.environment == "dev" ? aws_s3_bucket.guardagent_dev_logs[0].bucket : aws_s3_bucket.guardagent_prod_logs[0].bucket
}

output "bucket_arn" {
  description = "ARN of the created S3 bucket"
  value       = var.environment == "dev" ? aws_s3_bucket.guardagent_dev_logs[0].arn : aws_s3_bucket.guardagent_prod_logs[0].arn
}

output "iam_role_arn" {
  description = "ARN of the IAM role for GuardAgent"
  value       = aws_iam_role.guardagent_role.arn
}
