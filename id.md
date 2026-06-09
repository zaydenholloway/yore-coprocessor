YORE
Coprocessor
$YORE
Verifiable historical-state coprocessor for Solana. Yore lets on-chain programs read the chain's past, balances, ownership, prices and eligibility at any prior slot, and trust the answer through a single on-chain proof verification.
Technical Concept
Network: Solana / SVM    .    Category: ZK & verifiable compute infrastructure    .    Status: pre-build concept

Contents



1. Abstract
Solana programs are blind to their own history. The runtime exposes only the current state of accounts passed into an instruction; anything that was true at a previous slot, a balance, a token holding, a pool price, an owner, is unavailable on-chain and survives only in off-chain archives controlled by a handful of infrastructure providers. Today, applications that need a historical fact, an airdrop snapshot, a time-weighted price, a past-eligibility check, are forced to trust an off-chain script and a multisig that pushes the result on-chain.
Yore Coprocessor turns historical reads into a verifiable, permissionless market. A program submits a query about the past, a decentralized network of provers executes that query against a cryptographic commitment to Solana's historical state, and returns the result with a succinct proof that a Solana verifier program checks in a single call. The asymmetry is the point: producing the answer requires indexing and computing over historical data, while verifying it costs one proof check. This is the same verifiable-work principle that powers general ZK prover markets, narrowed to the one primitive Solana is missing, trustless access to its own past.
2. The Problem: Solana Cannot Read Its Own Past
Three structural facts create the gap Yore fills:
	•	No historical reads in the runtime. A Solana program can only see the accounts handed to it for the current transaction. There is no syscall for “what was the state of account X at slot S.” Even the current-state read is limited to explicitly passed accounts.
	•	History is pruned and centralized. Validators do not retain full historical account state; ledger history and old account data are pruned aggressively. Practical access to the past depends on centralized archives and warehouses (RPC providers, big-data exports), none of which is verifiable on-chain.
	•	The current workaround is trust. Protocols that need historical facts run an off-chain script and have a privileged signer push the result. The end user must trust both the script and the signer. This breaks the trust model that makes the rest of the application trustless.
The EVM ecosystem already treats this as a first-class infrastructure category, with historical-state and ZK coprocessors serving exactly these reads. Solana, despite a large DeFi and airdrop economy that constantly reasons about the past, has no native, trustless equivalent. That is the opening.
3. Solution Overview: Yore Coprocessor
Yore is a decentralized coprocessor: it moves a historical computation off-chain to a competitive prover network and brings back a result plus a proof, so the requesting Solana program inherits the same security as running the computation on-chain, at a fraction of the cost. The end-to-end flow is:
	•	Request. A Solana program (or an off-chain client on its behalf) submits a query to the Yore request program: a query type, parameters, the target slot or slot range, and a payment plus deadline.
	•	Compute. A prover claims the request, reads the relevant historical state against the committed root, executes the query (a balance lookup, a TWAP over a range, an eligibility test), and assembles a proof.
	•	Prove. The prover produces either a ZK proof of correct execution against the committed historical root, or an optimistic result backed by a bond, depending on the query's finality profile.
	•	Verify and settle. The Yore verifier program checks the proof in one call and writes the verified result where the requesting program can consume it. The prover is paid; an invalid proof or a missed deadline is slashed.
4. Architecture and Roles
The network separates four roles. They can overlap economically (a single operator may both archive and prove) but are distinct functions for incentive and slashing purposes.
Role
Function
Stake / reward
Requestor
Programs and dApps that need a historical fact on-chain. Submit queries and pay per fulfilled request.
Pays fees in $YORE or SOL routed to the fee market.
Prover
Executes the query over historical state and generates the proof. Competes for requests in a reverse-Dutch auction.
Stakes $YORE as collateral; earns request fee plus emissions for verified work.
Archivist
Maintains and serves the committed historical state (erasure-coded), guaranteeing data availability for provers.
Stakes $YORE; earns storage emissions; slashed on failed retrievability challenges.
Staker / verifier
Secures the commitment roots and the network; runs the on-chain verifier program and challenge logic.
Shares epoch emissions and fees for honest participation.

On-chain, Yore is a small set of Anchor programs: a request queue, a commitment registry that stores rolling historical-state roots, and a verifier that validates proofs (Groth16 verification via Solana's alt_bn128 syscalls for the ZK path, or a dispute game for the optimistic path).
5. Proof Model
Yore supports two settlement paths and routes each query to the appropriate one. This is a deliberate trade between cost, latency, and trust, rather than a single dogmatic choice.
Path
How it settles
Best for
Trade-off
ZK
Prover proves correct query execution against the committed root inside a zkVM; verifier checks a succinct proof on-chain.
High-value reads needing instant finality (liquidations, large airdrops).
Higher proving cost and latency per request.
Optimistic
Prover posts result plus bond; a challenge window lets anyone force re-execution of a sample and slash a fraudulent prover.
Cheap, high-volume, low-stakes reads where short finality delay is acceptable.
Latency to finality (challenge window); liveness assumption on watchers.
Hybrid (default)
Optimistic by default; auto-escalates to a ZK proof when the requestor flags instant finality or above a value threshold.
Most production traffic.
Requires both pipelines maintained.

Verification asymmetry (the clean proof of work). In both paths, verifying a result is cheap and objective: one proof check (ZK) or one re-execution of a sampled query against the committed root (optimistic). Producing the result requires holding and computing over historical state. Rewards are tied strictly to verified, fulfilled requests, so paid work is always work the network can independently check.
6. State Commitment and Data Availability
Everything rests on a cheap, verifiable commitment to Solana's past state. Yore commits to a Merkle (or Verkle) root over the set of account states per slot or per epoch, mapping each account public key to a hash of its data. These rolling roots are anchored in the on-chain commitment registry, so any historical fact can be proven by a Merkle path against the root for its slot.
Provers can only answer a query if the underlying data is actually retrievable, so archivists store the historical state erasure-coded and prove possession through periodic challenge-response sampling. This is the same retrievability primitive used by storage networks: cheap to verify, expensive to fake. The honest bootstrapping path is to derive initial roots from existing archives, then progressively decentralize archival and remove the trusted import as the network matures. Yore is explicit that, at genesis, correctness of the commitment depends on the source archive; the roadmap hardens this over time.
7. Proof of Verifiable Work and Settlement
Requests clear through a reverse-Dutch auction: the price a requestor is willing to pay rises over time until a prover accepts, which prices each query by real difficulty and current capacity. A prover must lock collateral of at least a fixed multiple of the maximum request payout before claiming, so fraud is never profitable, the expected slash exceeds the maximum gain.
Settlement is per-request and measurable. A fulfilled, verified request pays the prover the auction-cleared fee plus a share of epoch emissions weighted by verified compute. A proof that fails verification, or a deadline missed, burns part of the prover's stake and re-opens the request. Archivists earn emissions for proven storage and are slashed for failed retrievability challenges. This mirrors verifiable-work consensus: emissions follow cryptographically measured useful work, not arbitrary effort.
8. Token: $YORE
$YORE is the collateral, payment, and coordination asset of the network. Its utilities are deliberately tied to functions that cannot be served by a bare SOL fee.
Utility
Mechanism
Prover collateral
Provers and archivists stake $YORE (>= 10x max request payout) to participate; slashed for invalid proofs or unavailability.
Fee market
Requests are paid in $YORE, or in SOL routed to the $YORE fee market, via the reverse-Dutch auction.
Emissions for verified work
Epoch emissions reward provers (verified compute) and archivists (proven storage); a share goes to stakers.
Governance
Parameters: query-type registry, slashing ratios, collateral multiples, emission split, supported proof systems.

Emission split and inflation schedule are governance-set; the design intent is that demand from real query fees and staking should outpace issuance, with the majority of emissions directed to provers, who carry the network's compute cost, and a minority to stakers who secure it.
9. Use Cases
	•	Airdrop and eligibility snapshots. Prove a wallet held at least N of a mint at slot S, trustlessly, without an off-chain script and a privileged pusher.
	•	DeFi historical oracles. Time-weighted average prices over a slot range, retroactive liquidation and solvency checks, and oracle backstops derived from on-chain history.
	•	Time-weighted governance and loyalty. Voting power or rewards based on how long and how much a wallet held, proven rather than asserted.
	•	On-chain credit and reputation. Underwriting that references a wallet's historical balances and behavior with a verifiable proof.
	•	Gaming and points. Reward past on-chain actions or holdings as verifiable facts inside a contract.
10. MVP Scope (Solana / Anchor)
The first milestone is a single query type, end to end, on devnet: balance-of-account-at-slot. It proves the full loop while keeping surface area minimal.
	•	On-chain. Anchor programs for the request queue, the commitment registry (storing a few seeded historical roots), and a verifier using Solana's alt_bn128 / Groth16 syscalls for the ZK path.
	•	Prover. An off-chain worker that pulls historical account state from an existing archive, builds the Merkle path against the seeded root, and generates a ZK proof of the read in a zkVM.
	•	Demo. A sample contract requests “balance of wallet W at slot S,” a prover fulfills it, the verifier checks the proof, and the contract consumes the verified result and acts on it.
From there: add TWAP-over-range and holding-at-snapshot query types, ship the optimistic path for cheap reads, decentralize the archivist role with retrievability proofs, and open the prover auction permissionlessly.
11. Competitive Landscape and Positioning
Historical-state and ZK coprocessors are an established category on EVM (Axiom, Herodotus, Lagrange, Brevis) and the model is proven by general prover markets and EVM coprocessors such as Boundless Steel. None of these serve SVM in a first-class way. Yore's wedge is being the Solana-native equivalent, designed around the SVM account model, Solana's slot-based notion of time, and Solana's specific archival reality, rather than a port of an EVM design.
The relevant incumbents to displace are not other coprocessors but the status quo on Solana: trusted off-chain scripts plus multisig pushers, and centralized RPC and archive providers. Yore competes by making the same answers verifiable and permissionless.
12. Risks and Honest Positioning
	•	Proving cost and latency. ZK proofs over rich queries are expensive; the hybrid model and aggressive scoping of query types are the mitigation, not a claim that ZK is free.
	•	Optimistic finality delay. The cheap path carries a challenge window and a liveness assumption on honest watchers.
	•	Bootstrapping the data layer. Genesis correctness leans on existing centralized archives; the design is explicit that decentralizing archival and removing that trust is roadmap work, not a day-one property.
	•	Demand validation. The open question is how many Solana programs need historical reads strongly enough to pay for verifiability rather than trust a multisig. Early design targets the highest-value, most fraud-sensitive reads (large airdrops, liquidations) where the trust cost is unacceptable.
	•	Garbage-in. A proof attests correct computation against the committed root, not that the root reflects reality; commitment integrity is therefore a first-order security property, not an afterthought.
13. Roadmap
Phase
Milestone
Phase 0
Devnet MVP: balance-at-slot, single seeded root, ZK path, end-to-end demo contract.
Phase 1
Add TWAP-over-range and holding-at-snapshot query types; ship optimistic path and dispute game.
Phase 2
Permissionless prover auction; $YORE collateral, slashing, and fee market live on mainnet-beta.
Phase 3
Decentralize archivists with erasure coding and retrievability proofs; remove trusted archive import.
Phase 4
Open query-type registry via governance; coprocessor SDK for third-party integrators.
