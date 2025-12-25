import { defineAuth } from '@aws-amplify/backend';

// MVP: guest access (Identity Pool unauth role) is used.
// We keep a default user pool configuration available for future sign-in,
// but the current web UI does not require sign-in.
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
});
