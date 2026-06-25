#!/bin/bash

npm run build:viewer 
aws s3 sync apps/viewer/dist/ s3://ubc-eml-virtual-soils-prod-site-6acc18
aws cloudfront create-invalidation --distribution-id EBMJ39GWTMQS --paths "/*"

