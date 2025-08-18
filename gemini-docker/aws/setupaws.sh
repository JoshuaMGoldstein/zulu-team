aws ec2 describe-subnets --region us-east-1

aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-std
in 477961709976.dkr.ecr.us-east-1.amazonaws.com
#aws ecr create-repository --repository-name bioniclogic/zulu-team --region us-east-1
docker tag gemini-docker:latest 477961709976.dkr.ecr.us-east-1.amazonaws.com/bioniclogic/zulu-team:latest

docker push 477961709976.dkr.ecr.us-east-1.amazonaws.com/bioniclogic/zulu-team:latest
aws ecs register-task-definition --cli-input-json file://gemini-docker-task-defintion.json --region us-east-1

aws ecs create-service --cluster zulu-team-cluster --service-name zulu-team-gemini-docker --task-definition gemini-docker-task-definition --desired-count 1 --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[subnet-0bcb63c69e30d7d55,subnet-0edb997a40805baf1],securityGroups=[sg-be6ad7c5],assignPublicIp=ENABLED}" --region us-east-1
aws ecs list-tasks --cluster zulu-team-cluster --service-name zulu-team-gemini-docker --region us-east-1
aws ecs describe-tasks --cluster zulu-team-cluster --tasks task-arn --region us-east-1
