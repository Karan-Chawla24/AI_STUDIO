import {serve} from "inngest/next";
import {inngest,planningWorkflow,recoveryWorkflow} from "@/server/jobs/inngest";
export const runtime="nodejs";
export const maxDuration=180;
// The SDK verifies cloud signatures. Local unsigned requests require explicit INNGEST_DEV.
export const {GET,POST,PUT}=serve({client:inngest,functions:[planningWorkflow,recoveryWorkflow]});
