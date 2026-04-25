terraform {
  required_version = ">= 1.3"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
  }
}

# ─── Provider ─────────────────────────────────────────────────────────────────
provider "oci" {
  tenancy_ocid     = var.tenancy_ocid
  user_ocid        = var.user_ocid
  fingerprint      = var.fingerprint
  private_key_path = var.private_key_path
  region           = var.region
}

# ─── Availability Domain ──────────────────────────────────────────────────────
data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

locals {
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
}

# ─── VCN ──────────────────────────────────────────────────────────────────────
resource "oci_core_vcn" "tarko_vcn" {
  compartment_id = var.compartment_ocid
  cidr_block     = var.vcn_cidr
  display_name   = "tarko-vcn"
  dns_label      = "tarkovcn"
}

resource "oci_core_internet_gateway" "tarko_igw" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.tarko_vcn.id
  display_name   = "tarko-igw"
  enabled        = true
}

resource "oci_core_route_table" "tarko_rt" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.tarko_vcn.id
  display_name   = "tarko-route-table"

  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_internet_gateway.tarko_igw.id
  }
}

# ─── Security List ────────────────────────────────────────────────────────────
resource "oci_core_security_list" "tarko_sl" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.tarko_vcn.id
  display_name   = "tarko-security-list"

  # Allow all outbound
  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
    stateless   = false
  }

  # SSH
  ingress_security_rules {
    protocol  = "6" # TCP
    source    = "0.0.0.0/0"
    stateless = false
    tcp_options {
      min = 22
      max = 22
    }
  }

  # Backend API exposed directly (for Cloudflare DNS A record -> OCI public IP)
  ingress_security_rules {
    protocol  = "6"
    source    = "0.0.0.0/0"
    stateless = false
    tcp_options {
      min = 5500
      max = 5500
    }
  }

  # PostgreSQL exposed for external clients (limited to ISP range 223.185.0.0/16)
  ingress_security_rules {
    protocol  = "6"
    source    = "223.185.0.0/16"
    stateless = false
    tcp_options {
      min = 5432
      max = 5432
    }
  }

  # ICMP (ping)
  ingress_security_rules {
    protocol  = "1"
    source    = "0.0.0.0/0"
    stateless = false
    icmp_options {
      type = 3
      code = 4
    }
  }
}

# ─── Subnet ───────────────────────────────────────────────────────────────────
resource "oci_core_subnet" "tarko_subnet" {
  compartment_id    = var.compartment_ocid
  vcn_id            = oci_core_vcn.tarko_vcn.id
  cidr_block        = var.subnet_cidr
  display_name      = "tarko-public-subnet"
  dns_label         = "tarkosubnet"
  route_table_id    = oci_core_route_table.tarko_rt.id
  security_list_ids = [oci_core_security_list.tarko_sl.id]

  # Public subnet — instance gets a public IP automatically
  prohibit_public_ip_on_vnic = false
}

# ─── Compute Instance (x86 E2.1.Micro — Always Free) ─────────────────────────
resource "oci_core_instance" "tarko_vm" {
  compartment_id      = var.compartment_ocid
  availability_domain = local.availability_domain
  display_name        = "tarko-app"
  shape               = var.instance_shape
  # E2.1.Micro is a fixed shape — no shape_config block required

  source_details {
    source_type             = "image"
    source_id               = var.instance_image_ocid
    boot_volume_size_in_gbs = 50 # free tier includes up to 200 GB total
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.tarko_subnet.id
    assign_public_ip = true
    display_name     = "tarko-vnic"
  }

  metadata = {
    ssh_authorized_keys = file(var.ssh_public_key_path)
    user_data           = base64encode(templatefile("${path.module}/cloud-init.sh.tpl", {
      db_password    = var.db_password
      jwt_secret_key = var.jwt_secret_key
      app_url        = var.app_url
      cors_origins   = var.cors_origins
      tunnel_token   = var.tunnel_token
      git_token      = var.git_token
    }))
  }

  # Keep the instance after terraform destroy is called during re-deploy
  # to avoid losing data — change to false if you want full teardown
  preserve_boot_volume = false

  freeform_tags = {
    project = "tarko-stock-flow"
    env     = "production"
  }
}

# ─── Block Volume (persistent data — Always Free up to 200 GB total) ──────────
resource "oci_core_volume" "tarko_data" {
  compartment_id      = var.compartment_ocid
  availability_domain = local.availability_domain
  display_name        = "tarko-data-volume"
  size_in_gbs         = var.block_volume_size_gb

  freeform_tags = {
    project = "tarko-stock-flow"
  }
}

resource "oci_core_volume_attachment" "tarko_data_attach" {
  attachment_type = "paravirtualized"
  instance_id     = oci_core_instance.tarko_vm.id
  volume_id       = oci_core_volume.tarko_data.id
  display_name    = "tarko-data-attach"
  is_read_only    = false
}
