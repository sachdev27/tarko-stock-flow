output "instance_public_ip" {
  description = "Public IP address of the Tarko app VM"
  value       = oci_core_instance.tarko_vm.public_ip
}

output "instance_private_ip" {
  description = "Private IP address of the Tarko app VM"
  value       = oci_core_instance.tarko_vm.private_ip
}

output "instance_ocid" {
  description = "OCID of the compute instance"
  value       = oci_core_instance.tarko_vm.id
}

output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = "ssh -i ${var.ssh_private_key_path} opc@${oci_core_instance.tarko_vm.public_ip}"
}

output "app_url" {
  description = "URL to access the application"
  value       = "http://${oci_core_instance.tarko_vm.public_ip}"
}

output "block_volume_ocid" {
  description = "OCID of the persistent data block volume"
  value       = oci_core_volume.tarko_data.id
}
