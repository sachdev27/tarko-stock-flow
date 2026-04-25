# ─── OCI Authentication ───────────────────────────────────────────────────────
variable "tenancy_ocid" {
  description = "OCID of your OCI tenancy"
  type        = string
}

variable "user_ocid" {
  description = "OCID of the OCI user for API access"
  type        = string
}

variable "fingerprint" {
  description = "Fingerprint of the API signing key"
  type        = string
}

variable "private_key_path" {
  description = "Path to the OCI API private key (.pem)"
  type        = string
  default     = "~/.oci/oci_api_key.pem"
}

variable "region" {
  description = "OCI region (e.g. ap-mumbai-1, us-ashburn-1)"
  type        = string
  default     = "ap-mumbai-1"
}

# ─── Compartment ──────────────────────────────────────────────────────────────
variable "compartment_ocid" {
  description = "OCID of the compartment to deploy resources into (use root if unsure)"
  type        = string
}

# ─── Compute ──────────────────────────────────────────────────────────────────
variable "instance_shape" {
  description = "OCI compute shape — E2.1.Micro is x86 and Always Free (2 per tenancy)"
  type        = string
  default     = "VM.Standard.E2.1.Micro"
}

# Ubuntu 22.04 x86_64 — Canonical Ubuntu 22.04 (amd64).
# Find the OCID for your region:
#   OCI Console > Compute > Instances > Create Instance > Change Image
#   Select "Canonical Ubuntu" 22.04, shape = E2.1.Micro, copy the OCID.
variable "instance_image_ocid" {
  description = "OCID of the OS image (x86_64 Ubuntu 22.04 for E2.1.Micro)."
  type        = string
  # Set this in terraform.tfvars — get it from OCI Console as described above
  default     = "ocid1.image.oc1.ap-mumbai-1.REPLACE_WITH_YOUR_REGION_IMAGE_OCID"
}

# ─── SSH ──────────────────────────────────────────────────────────────────────
variable "ssh_public_key_path" {
  description = "Path to your SSH public key for instance access"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

variable "ssh_private_key_path" {
  description = "Path to your SSH private key (used for Ansible / remote-exec)"
  type        = string
  default     = "~/.ssh/id_rsa"
}

# ─── Networking ───────────────────────────────────────────────────────────────
variable "vcn_cidr" {
  description = "CIDR block for the VCN"
  type        = string
  default     = "10.0.0.0/16"
}

variable "subnet_cidr" {
  description = "CIDR block for the public subnet"
  type        = string
  default     = "10.0.1.0/24"
}

# ─── Storage ──────────────────────────────────────────────────────────────────
variable "block_volume_size_gb" {
  description = "Size of block volume for persistent data (free tier: up to 200 GB total)"
  type        = number
  default     = 50
}

# ─── Application ──────────────────────────────────────────────────────────────
variable "db_password" {
  description = "PostgreSQL database password"
  type        = string
  sensitive   = true
}

variable "jwt_secret_key" {
  description = "JWT secret key for the Flask backend (min 32 chars)"
  type        = string
  sensitive   = true
}

variable "app_url" {
  description = "Public URL of the frontend (e.g. https://tarko-inv.web.app)"
  type        = string
  default     = "https://tarko-inv.web.app"
}

variable "cors_origins" {
  description = "Allowed CORS origins for the backend"
  type        = string
  default     = "*"
}

variable "tunnel_token" {
  description = "Cloudflare tunnel token (leave empty to skip cloudflared)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "git_token" {
  description = "GitHub personal access token to clone the private repo"
  type        = string
  sensitive   = true
  default     = ""
}
