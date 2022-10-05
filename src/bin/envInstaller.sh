
#python3
apt-get install python3

#python3 dependencies

python3 -m pip install SomePackage


#dotnet6

apt-get install dotnet6   
apt-get install -y aspnetcore-runtime-6.0 
apt-get install -y dotnet-runtime-6.0

#dotnet modules

dotnet add package <PACKAGE_NAME> --version <VERSION>

#ruby

apt install ruby-full

#swift

apt-get install clang libicu-dev
wget [swift.org/builds/sw...](https://swift.org/builds/swift-5.1.3-release/ubuntu1804/swift-5.1.3-RELEASE/swift-5.1.3-RELEASE-ubuntu18.04.tar.gz)
tar -xvzf swift-5.1.3-RELEASE*
export PATH=/home/mw/src/swift-5.1.3-RELEASE-ubuntu18.04

#rust 

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

#php

apt install software-properties-common ca-certificates lsb-release apt-transport-https 
LC_ALL=C.UTF-8 add-apt-repository ppa:ondrej/php 
sudo apt update 
sudo apt install php8.1 

#php - extension

sudo apt install php8.1-[extension]

#go

wget https://go.dev/dl/go1.19.1.linux-amd64.tar.gz
tar -C /usr/local -xzf go1.19.1.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin

#ballerina

wget https://dist.ballerina.io/downloads/2201.2.0/ballerina-2201.2.0-swan-lake-linux-x64.deb
