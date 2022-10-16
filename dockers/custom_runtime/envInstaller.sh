#!bin/bash
echo $1 $2 $3 $4 $5 $6 $7 $8

if $1 -eq true
then

echo " -----------------------------\n INSTALLING PYTHON \n-----------------------------\n" 
apt-get install python3 -y

fi

if $2 -eq true
then

echo " \n-----------------------------\n INSTALLING DOTNET \n-----------------------------\n" 
wget https://packages.microsoft.com/config/ubuntu/20.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb
dpkg -i packages-microsoft-prod.deb
rm packages-microsoft-prod.deb
apt-get update
apt-get install -y aspnetcore-runtime-6.0 
apt-get install -y dotnet-runtime-6.0
fi

if $3 -eq true
then
echo " \n-----------------------------\n INSTALLING RUBY \n-----------------------------\n" 
apt install ruby-full -y

fi

if $4 -eq true
then

echo " \n-----------------------------\n INSTALLING SWIFT \n-----------------------------\n" 
apt install -y clang libpython2.7 libpython2.7-dev
wget https://swift.org/builds/swift-5.3-release/ubuntu2004/swift-5.3-RELEASE/swift-5.3-RELEASE-ubuntu20.04.tar.gz
tar xzf swift-5.3-RELEASE-ubuntu20.04.tar.gz
mv swift-5.3-RELEASE-ubuntu20.04 /usr/share/swift
echo "export PATH=/usr/share/swift/usr/bin:$PATH" >> ~/.bashrc
. ~/.bashrc
rm swift-5.3-RELEASE-ubuntu20.04.tar.gz

fi

if $5 -eq true
then

echo " \n-----------------------------\n INSTALLING RUST \n-----------------------------\n" 
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs >> rustInst.sh
sh rustInst.sh -y
. "$HOME/.cargo/env"
rm rustInst.sh

fi

if $6 -eq true
then

echo " \n-----------------------------\n INSTALLING PHP \n-----------------------------\n" 
apt update
apt install software-properties-common -y
add-apt-repository ppa:ondrej/php
apt update
apt install --no-install-recommends php -y

fi

if $7 -eq true
then

echo " \n-----------------------------\n INSTALLING GO \n-----------------------------\n" 
wget https://go.dev/dl/go1.19.1.linux-amd64.tar.gz
tar -C /usr/local -xzf go1.19.1.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin

fi

if $8 -eq true
then
echo " \n-----------------------------\n INSTALLING BALLERINA \n-----------------------------\n" 
wget https://dist.ballerina.io/downloads/2201.2.0/ballerina-2201.2.0-swan-lake-linux-x64.deb
dpkg -i ballerina-2201.2.0-swan-lake-linux-x64.deb
rm ballerina-2201.2.0-swan-lake-linux-x64.deb

fi

if $9 -eq true
then

echo " \n-----------------------------\n INSTALLING JAVA \n-----------------------------\n" 

apt-get install openjdk-8-jdk -y
sudo update-alternatives --set java /usr/lib/jvm/java-8-openjdk-amd64/bin/java

fi
