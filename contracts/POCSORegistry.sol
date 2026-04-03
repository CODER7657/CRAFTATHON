// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title POCSORegistry
 * @notice Anonymous child safety reporting system — POCSO Shield
 * @dev Stores IPFS-pinned reports with ZK proof hashes. Authority-gated action logging.
 */
contract POCSORegistry is ReentrancyGuard, Ownable {
    // ─────────────────────────────────────────────────────────────────────────
    // Structs
    // ─────────────────────────────────────────────────────────────────────────

    struct Report {
        string   ipfsCid;       // IPFS content identifier for encrypted report
        bytes32  zkProofHash;   // Hash of the zero-knowledge proof
        uint256  timestamp;     // Block timestamp at submission
        bytes32  anonymousId;   // Salted hash of reporter identity (never stored raw)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    mapping(bytes32 => Report)    public reports;
    mapping(bytes32 => string[])  public actionLog;
    mapping(address => bool)      public isAuthority;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event ReportSubmitted(
        bytes32 indexed reportId,
        string          ipfsCid,
        bytes32         zkProofHash,
        bytes32         anonymousId,
        uint256         timestamp
    );

    event ActionLogged(
        bytes32 indexed reportId,
        address indexed authority,
        string          actionType,
        uint256         timestamp
    );

    event AuthorityAssigned(address indexed auth);
    event AuthorityRevoked(address indexed auth);

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlyAuthority() {
        require(isAuthority[msg.sender], "POCSORegistry: caller is not an authority");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─────────────────────────────────────────────────────────────────────────
    // Core Functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Submit an anonymous child safety report
     * @param reportId    Unique identifier (keccak256 of anonymousId + nonce)
     * @param ipfsCid     IPFS CID pointing to encrypted report content
     * @param zkProofHash Hash of ZK proof verifying reporter eligibility without revealing identity
     * @param anonymousId Salted hash of reporter identity
     */
    function submitReport(
        bytes32 reportId,
        string  memory ipfsCid,
        bytes32 zkProofHash,
        bytes32 anonymousId
    ) external nonReentrant {
        require(bytes(ipfsCid).length > 0, "POCSORegistry: empty IPFS CID");
        require(zkProofHash != bytes32(0), "POCSORegistry: empty ZK proof hash");
        require(anonymousId != bytes32(0), "POCSORegistry: empty anonymous ID");
        require(bytes(reports[reportId].ipfsCid).length == 0, "POCSORegistry: report already exists");

        reports[reportId] = Report({
            ipfsCid:     ipfsCid,
            zkProofHash: zkProofHash,
            timestamp:   block.timestamp,
            anonymousId: anonymousId
        });

        emit ReportSubmitted(reportId, ipfsCid, zkProofHash, anonymousId, block.timestamp);
    }

    /**
     * @notice Log an authority action on a report (investigation update, escalation, etc.)
     * @param reportId   Target report
     * @param actionType Free-form string describing the authority action
     */
    function logAuthorityAction(
        bytes32 reportId,
        string  memory actionType
    ) external onlyAuthority nonReentrant {
        require(bytes(reports[reportId].ipfsCid).length > 0, "POCSORegistry: report does not exist");
        require(bytes(actionType).length > 0, "POCSORegistry: empty action type");

        actionLog[reportId].push(actionType);

        emit ActionLogged(reportId, msg.sender, actionType, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Authority Management (onlyOwner)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Grant authority role to an address
     * @param auth Address to assign as authority
     */
    function assignAuthority(address auth) external onlyOwner {
        require(auth != address(0), "POCSORegistry: zero address");
        require(!isAuthority[auth], "POCSORegistry: already an authority");
        isAuthority[auth] = true;
        emit AuthorityAssigned(auth);
    }

    /**
     * @notice Revoke authority role from an address
     * @param auth Address to revoke
     */
    function revokeAuthority(address auth) external onlyOwner {
        require(isAuthority[auth], "POCSORegistry: not an authority");
        isAuthority[auth] = false;
        emit AuthorityRevoked(auth);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Fetch a report by ID
     * @param reportId The report identifier
     * @return ipfsCid IPFS content identifier
     * @return zkProofHash Hash of the zero-knowledge proof
     * @return timestamp Block timestamp at submission
     * @return anonymousId Salted hash of reporter identity
    */
    function getReport(bytes32 reportId)
        external
        view
        returns (
            string  memory ipfsCid,
            bytes32        zkProofHash,
            uint256        timestamp,
            bytes32        anonymousId
        )
    {
        Report storage r = reports[reportId];
        return (r.ipfsCid, r.zkProofHash, r.timestamp, r.anonymousId);
    }

    /**
     * @notice Get all action log entries for a report
     * @param reportId The report identifier
     * @return Array of action strings
     */
    function getActionLog(bytes32 reportId)
        external
        view
        returns (string[] memory)
    {
        return actionLog[reportId];
    }
}
