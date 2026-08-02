data "aws_ami" "ubuntu" {
  most_recent = true

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  owners = ["099720109477"] # Canonical
}

# 1. Create a Security Group for the EC2 Instances
resource "aws_security_group" "asg_sg" {
  name        = "ansible-node-security_group"
  description = "Allow SSH and HTTP traffic"
  vpc_id      = module.vpc.vpc_id

  # Allow inbound SSH (Required for your Ansible controller to connect)
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # In prod, restrict this to your specific IP range
  }

  # Allow inbound HTTP for Nginx
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow inbound HTTP for Nginx
  ingress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

    # Allow inbound HTTP for Nginx
  ingress {
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow inbound ICMP for Ping
  ingress {   
    from_port   = -1
    to_port     = -1
    protocol    = "icmp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Outbound rules: Allow everything (Required to download apt/dnf updates)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "asg-sg"
  }
}

# Allow all traffic between instances in this Security Group
resource "aws_security_group_rule" "allow_internal_traffic" {
  type                     = "ingress"
  from_port                = 0
  to_port                  = 0
  protocol                 = "-1"
  source_security_group_id = aws_security_group.asg_sg.id
  security_group_id        = aws_security_group.asg_sg.id
}

# Define the Master Node Template
resource "aws_launch_template" "k8s_master_node_asg_template" {
  name   = "k8s-master-node-asg-launch-template"
  image_id      = data.aws_ami.ubuntu.id
  instance_type = "t3a.medium"

  # Attach the Security Group created above
  vpc_security_group_ids = [aws_security_group.asg_sg.id]

  # SSH Key pair name already registered in your AWS Console
  key_name = "ec2"

  lifecycle {
    create_before_destroy = true
  }
}

# Define the Worker Node Template
resource "aws_launch_template" "k8s_worker_node_asg_template" {
  name   = "k8s-worker-node-asg-launch-template"
  image_id      = data.aws_ami.ubuntu.id
  instance_type = "t3.large"

  # Attach the Security Group created above
  vpc_security_group_ids = [aws_security_group.asg_sg.id]

  # SSH Key pair name already registered in your AWS Console
  key_name = "ec2"

  block_device_mappings {
    device_name = "/dev/sda1"
    ebs {
      volume_size           = 30
      volume_type           = "gp3"
      delete_on_termination = true
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Define the Master Auto Scaling Group
resource "aws_autoscaling_group" "k8s_master_node_asg" {
  name         = "k8s-master-nodes-asg"
  desired_capacity    = 1
  max_size            = 1
  min_size            = 1
  vpc_zone_identifier = module.vpc.private_subnets

  # Link the ASG to the Launch Template
  launch_template {
    id      = aws_launch_template.k8s_master_node_asg_template.id
    version = "$Latest" # Automatically uses the latest iteration of the template
  }

  tag {
    key                 = "Name"
    value               = "k8s-master-node"
    propagate_at_launch = true
  }

  # Crucial for dynamic Ansible inventories
  tag {
    key                 = "Environment"
    value               = "Development"
    propagate_at_launch = true # Enforces that instances inherit this tag upon boot
  }

  tag {
    key                 = "Role"
    value               = "backend"
    propagate_at_launch = true
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Define the Worker Auto Scaling Group
resource "aws_autoscaling_group" "k8s_worker_node_asg" {
  name         = "k8s-worker-nodes-asg"
  desired_capacity    = 1
  max_size            = 1
  min_size            = 1
  vpc_zone_identifier = module.vpc.private_subnets

  # Link the ASG to the Launch Template
  launch_template {
    id      = aws_launch_template.k8s_worker_node_asg_template.id
    version = "$Latest" # Automatically uses the latest iteration of the template
  }

  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50 # Adjust based on your minimum node requirements
    }
    triggers = ["launch_template"]
  }

  tag {
    key                 = "Name"
    value               = "k8s-worker-node"
    propagate_at_launch = true
  }

  # Crucial for dynamic Ansible inventories
  tag {
    key                 = "Environment"
    value               = "Development"
    propagate_at_launch = true # Enforces that instances inherit this tag upon boot
  }

  tag {
    key                 = "Role"
    value               = "backend"
    propagate_at_launch = true
  }

  lifecycle {
    create_before_destroy = true
  }
}