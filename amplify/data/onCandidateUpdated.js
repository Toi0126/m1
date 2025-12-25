import { util, extensions } from "@aws-appsync/utils";

// Subscription handlers must return a null payload on the request.
export function request() {
  return { payload: null };
}

/**
 * Filters subscription events by eventId.
 * @param {import('@aws-appsync/utils').Context} ctx
 */
export function response(ctx) {
  const filter = {
    eventId: {
      eq: ctx.args.eventId,
    },
  };

  extensions.setSubscriptionFilter(util.transform.toSubscriptionFilter(filter));
  return null;
}
