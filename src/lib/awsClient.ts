import { AwsClient } from "aws4fetch";

export const awsClient = new AwsClient({
  accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID!,
  secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY!,
  region: import.meta.env.VITE_AWS_REGION!,
  service: "execute-api"
});