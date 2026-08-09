import { defineBackend } from "@aws-amplify/backend";
import { Effect, Policy, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";

import { auth } from "./auth/resource";
import { data } from "./data/resource";

const backend = defineBackend({
  auth,
  data,
});

// Connect to the existing S3 bucket
const customBucketStack = backend.createStack("custom-bucket-stack");

const customBucket = Bucket.fromBucketAttributes(
  customBucketStack,
  "MyCustomBucket",
  {
    bucketArn: "arn:aws:s3:::ai-social-media-generator",
    region: "us-east-1",
  }
);

// Tell Amplify about the existing S3 bucket
backend.addOutput({
  storage: {
    aws_region: customBucket.env.region,
    bucket_name: customBucket.bucketName,

    buckets: [
      {
        aws_region: customBucket.env.region,
        bucket_name: customBucket.bucketName,
        name: "ai-social-media-generator",

        paths: {
          "public/*": {
            authenticated: ["get", "list", "write", "delete"],
          },
        },
      },
    ],
  },
});

// Give authenticated users permission to use the bucket
const authPolicy = new Policy(
  backend.stack,
  "customBucketAuthPolicy",
  {
    statements: [
      new PolicyStatement({
        effect: Effect.ALLOW,

        actions: [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ],

        resources: [
          `${customBucket.bucketArn}/public/*`,
        ],
      }),

      new PolicyStatement({
        effect: Effect.ALLOW,

        actions: ["s3:ListBucket"],

        resources: [
          customBucket.bucketArn,
        ],

        conditions: {
          StringLike: {
            "s3:prefix": [
              "public/",
              "public/*",
            ],
          },
        },
      }),
    ],
  }
);

backend.auth.resources.authenticatedUserIamRole.attachInlinePolicy(
  authPolicy
);
