import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

let db;
let customer;
let otherCustomer;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);

async function newPost(user) {
  const category = (await sys(db, `select id from categories limit 1`))[0].id;
  const rows = await as(db, user, `
    insert into job_posts (customer_id, category_id, title, description, address_text, target_date, budget_max, status)
    values ($1, $2, 'Bridal styling', 'Two people, home visit', 'Al-Yasmin, Riyadh', now() + interval '3 days', 900, 'assigned')
    returning id, status, latitude`, [user.sub, category]);
  return rows[0];
}

async function bid(owner, providerId, postId, price, status = "pending") {
  return (await as(db, owner, `
    insert into job_bids (job_post_id, provider_id, bid_price, proposal_notes, status)
    values ($1, $2, $3, 'We can do it', $4) returning id, status`, [postId, providerId, price, status]))[0];
}

before(async () => {
  db = await createMigratedDb();
  customer = ROLES.user(await createUser(db));
  otherCustomer = ROLES.user(await createUser(db));
  await sys(db, `update providers set status = 'active' where id in ($1, $2)`, [SEED.provider1, SEED.provider2]);
});

describe("request board", () => {
  it("creates posts as open without invented coordinates", async () => {
    const post = await newPost(customer);
    assert.equal(post.status, "open", "a client cannot create a post in another status");
    assert.equal(post.latitude, null);
  });

  it("forces new bids to pending and blocks self-acceptance", async () => {
    const post = await newPost(customer);
    const b = await bid(owner1, SEED.provider1, post.id, 800, "accepted");
    assert.equal(b.status, "pending");
    await expectError(as(db, owner1, `update job_bids set status = 'accepted' where id = $1`, [b.id]), /accepted or rejected only by the customer/);
    await as(db, owner1, `update job_posts set status = 'assigned' where id = $1`, [post.id]);
    assert.equal((await sys(db, `select status from job_posts where id = $1`, [post.id]))[0].status, "open");
  });

  it("lets only the posting customer accept, rejecting the other bids", async () => {
    const post = await newPost(customer);
    const b1 = await bid(owner1, SEED.provider1, post.id, 850);
    const b2 = await bid(owner2, SEED.provider2, post.id, 700);

    await expectError(as(db, otherCustomer, `select accept_job_bid($1)`, [b1.id]), /Only the customer who posted/);
    await expectError(as(db, owner1, `select accept_job_bid($1)`, [b1.id]), /Only the customer who posted/);
    // Customers have no UPDATE policy on bids: a direct write changes nothing.
    await as(db, customer, `update job_bids set status = 'accepted' where id = $1`, [b1.id]);
    assert.equal((await sys(db, `select status from job_bids where id = $1`, [b1.id]))[0].status, "pending");

    const result = (await as(db, customer, `select accept_job_bid($1) r`, [b2.id]))[0].r;
    assert.equal(result.success, true);
    const rows = await sys(db, `select id, status from job_bids where job_post_id = $1`, [post.id]);
    assert.equal(rows.find((r) => r.id === b2.id).status, "accepted");
    assert.equal(rows.find((r) => r.id === b1.id).status, "rejected");
    assert.equal((await sys(db, `select status from job_posts where id = $1`, [post.id]))[0].status, "assigned");

    await expectError(as(db, customer, `select accept_job_bid($1)`, [b1.id]), /no longer open/);
    await expectError(bid(owner1, SEED.provider1, post.id, 600), /no longer open for bids|duplicate/);
  });

  it("lets the customer cancel an open request but not reopen it", async () => {
    const post = await newPost(customer);
    await as(db, customer, `update job_posts set status = 'cancelled' where id = $1`, [post.id]);
    await expectError(as(db, customer, `update job_posts set status = 'open' where id = $1`, [post.id]), /status changes only/);
  });

  it("rejects bids from unverified providers and foreign professionals", async () => {
    const post = await newPost(customer);
    const foreign = (await sys(db, `
      select e.id from employees e join branches b on b.id = e.branch_id where b.provider_id <> $1 limit 1`, [SEED.provider1]))[0];
    if (foreign) {
      await expectError(as(db, owner1, `
        insert into job_bids (job_post_id, provider_id, employee_id, bid_price) values ($1, $2, $3, 500)`,
        [post.id, SEED.provider1, foreign.id]), /does not work for this provider/);
    }

    await sys(db, `update providers set status = 'suspended' where id = $1`, [SEED.provider2]);
    await expectError(bid(owner2, SEED.provider2, post.id, 500), /Only verified providers/);
    await sys(db, `update providers set status = 'active' where id = $1`, [SEED.provider2]);
  });

  it("does not expose the accept command to anonymous visitors", async () => {
    await expectError(as(db, ROLES.anon, `select accept_job_bid(gen_random_uuid())`), /permission denied/);
  });
});
