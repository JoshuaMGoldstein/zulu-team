#!/bin/bash

# Set the GCSFUSE repository based on Ubuntu version
export GCSFUSE_REPO=gcsfuse-`lsb_release -c -s`

# Add the gcsfuse package repository
echo "deb http://packages.cloud.google.com/apt $GCSFUSE_REPO main" | sudo tee /etc/apt/sources.list.d/gcsfuse.list

# Import the Google Cloud public key
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add -

# Update the package list
sudo apt-get update

# Install gcsfuse
sudo apt-get install gcsfuse -y

echo "gcsfuse installation script completed."
