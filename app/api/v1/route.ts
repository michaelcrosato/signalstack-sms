import { createPublicApiNotFoundHandler } from "@/lib/public-api/method-not-allowed";

export const dynamic = "force-dynamic";

const notFound = createPublicApiNotFoundHandler();
export {
  notFound as GET,
  notFound as POST,
  notFound as PUT,
  notFound as PATCH,
  notFound as DELETE,
  notFound as HEAD,
  notFound as OPTIONS
};
