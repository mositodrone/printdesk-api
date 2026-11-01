import { MongoMemoryServer } from "mongodb-memory-server";

let mongod;

// Runs once, before any test file. Starts a throwaway MongoDB that lives in memory
// and hands its address to the test workers with provide() / inject().
export async function setup(project) {
  mongod = await MongoMemoryServer.create();
  project.provide("mongoUri", mongod.getUri());
}

export async function teardown() {
  await mongod?.stop();
}
