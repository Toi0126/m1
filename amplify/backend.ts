import { defineBackend } from '@aws-amplify/backend';

import { auth } from './auth/resource';
import { data } from './data/resource';

export const backend = defineBackend({
  auth,
  data,
});

// Guest access (unauthenticated role) is enabled by default in Amplify Gen 2.
// This app intentionally relies on guest IAM (Identity Pool) for MVP.
