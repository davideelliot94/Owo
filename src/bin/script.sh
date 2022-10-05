#!bin/bash

wget -O ../cli/fopt https://raw.githubusercontent.com/davideelliot94/FaaS-Optimizer-CLI/main/fopt -q --show-progress
wget -O ../cli/setup_cli.sh https://raw.githubusercontent.com/davideelliot94/FaaS-Optimizer-CLI/main/setup_cli.sh -q --show-progress


echo "\e[31m-------------------------------------------------------------------------------------------  \n\n"
echo "\t\e[31mPlease run 'sudo chmod +x setup_cli.sh' and then run 'sh setup_cli.sh' to setup the command line interface \n\n"
echo "\e[31m-------------------------------------------------------------------------------------------  \e[0m\n\n"


npm start
