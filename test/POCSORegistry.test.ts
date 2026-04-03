const { expect } = require("chai");
const { ethers } = require("hardhat");

function randomBytes32() {
  return ethers.hexlify(ethers.randomBytes(32));
}

const MOCK_IPFS_CID  = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";
const MOCK_ZK_HASH   = randomBytes32();
const MOCK_ANON_ID   = randomBytes32();
const MOCK_REPORT_ID = ethers.keccak256(
  ethers.solidityPacked(["bytes32", "uint256"], [MOCK_ANON_ID, 12345])
);

describe("POCSORegistry", function () {
  let contract, owner, authority, stranger;

  beforeEach(async function () {
    [owner, authority, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("POCSORegistry");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  describe("Deployment", function () {
    it("sets deployer as owner", async function () {
      expect(await contract.owner()).to.equal(owner.address);
    });
    it("starts with no authorities", async function () {
      expect(await contract.isAuthority(authority.address)).to.be.false;
    });
  });

  describe("Authority Management", function () {
    it("owner can assign an authority", async function () {
      await contract.assignAuthority(authority.address);
      expect(await contract.isAuthority(authority.address)).to.be.true;
    });
    it("assignAuthority emits AuthorityAssigned", async function () {
      await expect(contract.assignAuthority(authority.address))
        .to.emit(contract, "AuthorityAssigned")
        .withArgs(authority.address);
    });
    it("owner can revoke an authority", async function () {
      await contract.assignAuthority(authority.address);
      await contract.revokeAuthority(authority.address);
      expect(await contract.isAuthority(authority.address)).to.be.false;
    });
    it("non-owner cannot assign authority", async function () {
      await expect(
        contract.connect(stranger).assignAuthority(authority.address)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });
    it("cannot assign zero address", async function () {
      await expect(
        contract.assignAuthority(ethers.ZeroAddress)
      ).to.be.revertedWith("POCSORegistry: zero address");
    });
    it("cannot assign same authority twice", async function () {
      await contract.assignAuthority(authority.address);
      await expect(
        contract.assignAuthority(authority.address)
      ).to.be.revertedWith("POCSORegistry: already an authority");
    });
    it("cannot revoke a non-authority", async function () {
      await expect(
        contract.revokeAuthority(stranger.address)
      ).to.be.revertedWith("POCSORegistry: not an authority");
    });
  });

  describe("submitReport", function () {
    it("stores report data correctly", async function () {
      await contract.submitReport(MOCK_REPORT_ID, MOCK_IPFS_CID, MOCK_ZK_HASH, MOCK_ANON_ID);
      const [cid, zkHash, ts, anonId] = await contract.getReport(MOCK_REPORT_ID);
      expect(cid).to.equal(MOCK_IPFS_CID);
      expect(zkHash).to.equal(MOCK_ZK_HASH);
      expect(ts).to.be.gt(0n);
      expect(anonId).to.equal(MOCK_ANON_ID);
    });
    it("emits ReportSubmitted with correct args", async function () {
      const tx = await contract.submitReport(MOCK_REPORT_ID, MOCK_IPFS_CID, MOCK_ZK_HASH, MOCK_ANON_ID);
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment?.name === "ReportSubmitted");
      expect(event).to.not.be.undefined;
      expect(event.args.reportId).to.equal(MOCK_REPORT_ID);
      expect(event.args.ipfsCid).to.equal(MOCK_IPFS_CID);
      expect(event.args.zkProofHash).to.equal(MOCK_ZK_HASH);
      expect(event.args.anonymousId).to.equal(MOCK_ANON_ID);
    });
    it("reverts on empty IPFS CID", async function () {
      await expect(
        contract.submitReport(MOCK_REPORT_ID, "", MOCK_ZK_HASH, MOCK_ANON_ID)
      ).to.be.revertedWith("POCSORegistry: empty IPFS CID");
    });
    it("reverts on zero zkProofHash", async function () {
      await expect(
        contract.submitReport(MOCK_REPORT_ID, MOCK_IPFS_CID, ethers.ZeroHash, MOCK_ANON_ID)
      ).to.be.revertedWith("POCSORegistry: empty ZK proof hash");
    });
    it("reverts on zero anonymousId", async function () {
      await expect(
        contract.submitReport(MOCK_REPORT_ID, MOCK_IPFS_CID, MOCK_ZK_HASH, ethers.ZeroHash)
      ).to.be.revertedWith("POCSORegistry: empty anonymous ID");
    });
    it("reverts on duplicate reportId", async function () {
      await contract.submitReport(MOCK_REPORT_ID, MOCK_IPFS_CID, MOCK_ZK_HASH, MOCK_ANON_ID);
      await expect(
        contract.submitReport(MOCK_REPORT_ID, MOCK_IPFS_CID, MOCK_ZK_HASH, MOCK_ANON_ID)
      ).to.be.revertedWith("POCSORegistry: report already exists");
    });
  });

  describe("logAuthorityAction", function () {
    beforeEach(async function () {
      await contract.submitReport(MOCK_REPORT_ID, MOCK_IPFS_CID, MOCK_ZK_HASH, MOCK_ANON_ID);
      await contract.assignAuthority(authority.address);
    });
    it("authority can log an action", async function () {
      const tx = await contract.connect(authority).logAuthorityAction(MOCK_REPORT_ID, "INVESTIGATION_STARTED");
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);
    });
    it("emits ActionLogged with correct args", async function () {
      const tx = await contract.connect(authority).logAuthorityAction(MOCK_REPORT_ID, "FIR_FILED");
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment?.name === "ActionLogged");
      expect(event).to.not.be.undefined;
      expect(event.args.reportId).to.equal(MOCK_REPORT_ID);
      expect(event.args.authority).to.equal(authority.address);
      expect(event.args.actionType).to.equal("FIR_FILED");
    });
    it("stores multiple actions in actionLog", async function () {
      await contract.connect(authority).logAuthorityAction(MOCK_REPORT_ID, "FIR_FILED");
      await contract.connect(authority).logAuthorityAction(MOCK_REPORT_ID, "COURT_SUBMITTED");
      const log = await contract.getActionLog(MOCK_REPORT_ID);
      expect(log).to.deep.equal(["FIR_FILED", "COURT_SUBMITTED"]);
    });
    it("non-authority cannot log action", async function () {
      await expect(
        contract.connect(stranger).logAuthorityAction(MOCK_REPORT_ID, "HACK")
      ).to.be.revertedWith("POCSORegistry: caller is not an authority");
    });
    it("reverts on non-existent report", async function () {
      const fakeId = randomBytes32();
      await expect(
        contract.connect(authority).logAuthorityAction(fakeId, "ACTION")
      ).to.be.revertedWith("POCSORegistry: report does not exist");
    });
    it("reverts on empty action string", async function () {
      await expect(
        contract.connect(authority).logAuthorityAction(MOCK_REPORT_ID, "")
      ).to.be.revertedWith("POCSORegistry: empty action type");
    });
    it("revoked authority cannot log action", async function () {
      await contract.revokeAuthority(authority.address);
      await expect(
        contract.connect(authority).logAuthorityAction(MOCK_REPORT_ID, "ATTEMPT")
      ).to.be.revertedWith("POCSORegistry: caller is not an authority");
    });
  });

  describe("Full flow integration", function () {
    it("submit → assign authority → log 3 actions → verify end-to-end", async function () {
      await contract.submitReport(MOCK_REPORT_ID, MOCK_IPFS_CID, MOCK_ZK_HASH, MOCK_ANON_ID);
      await contract.assignAuthority(authority.address);
      expect(await contract.isAuthority(authority.address)).to.be.true;

      await contract.connect(authority).logAuthorityAction(MOCK_REPORT_ID, "CASE_OPENED");
      await contract.connect(authority).logAuthorityAction(MOCK_REPORT_ID, "CHILD_SAFE");
      await contract.connect(authority).logAuthorityAction(MOCK_REPORT_ID, "CASE_CLOSED");

      const [cid, zkHash, ts, anonId] = await contract.getReport(MOCK_REPORT_ID);
      expect(cid).to.equal(MOCK_IPFS_CID);
      expect(zkHash).to.equal(MOCK_ZK_HASH);
      expect(ts).to.be.gt(0n);
      expect(anonId).to.equal(MOCK_ANON_ID);

      const log = await contract.getActionLog(MOCK_REPORT_ID);
      expect(log.length).to.equal(3);
      expect(log[0]).to.equal("CASE_OPENED");
      expect(log[2]).to.equal("CASE_CLOSED");
    });
  });
});