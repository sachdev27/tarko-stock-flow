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
  description = "OCI compute shape — VM.Standard.A1.Flex is Ampere ARM and Always Free eligible"
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "instance_ocpus" {
  description = "Number of OCPUs for A1 Flex (Always Free target: 1)"
  type        = number
  default     = 1
}

variable "instance_memory_in_gbs" {
  description = "Memory in GB for A1 Flex (Always Free target: 6)"
  type        = number
  default     = 6
}

# Optional Oracle Linux 9 image OCID override.
# Leave empty to auto-select latest Oracle Linux 9 image for the chosen shape.
variable "instance_image_ocid" {
  description = "Optional OCID of OS image. Empty uses latest Oracle Linux 9 image for the selected shape."
  type        = string
  default     = ""
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
