// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AgentTip — tip BNB to an Agent ID (.ai name) without knowing the 0x address
/// @notice Resolves the .ai name on-chain via the SPACE ID Agent ID registry (ERC-721)
///         and forwards the FULL msg.value to the name's owner. No fees, no admin,
///         no owner functions, no token handling. BNB only.
/// @dev Registry: 0x60b9262456de011f7d15a54cdd8c48baaa8b022f (SPACE ID Agent ID, "AI").
///      tokenId for a name = uint256(keccak256(name WITHOUT the ".ai" suffix)),
///      e.g. keccak256("ajidayubi"). Verified on-chain 2026-11-18.
interface IAgentIDRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
}

contract AgentTip {
    IAgentIDRegistry public constant REGISTRY =
        IAgentIDRegistry(0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F);

    /// @notice Minimum tip: 0.0001 BNB (~$0.01 at current prices).
    uint256 public constant MIN_TIP = 0.0001 ether;

    /// @notice Maximum name length after normalization (SPACE ID labels are <= 63 chars).
    uint256 public constant MAX_NAME_LEN = 64;

    /// @notice Maximum message length (keeps event data bounded).
    uint256 public constant MAX_MESSAGE_LEN = 280;

    event Tip(
        address indexed sender,
        string name,
        address indexed recipient,
        uint256 amount,
        string message
    );

    error EmptyName();
    error NameTooLong(uint256 length);
    error MessageTooLong(uint256 length);
    error TipTooSmall(uint256 amount, uint256 minimum);
    error NameNotRegistered(string name);
    error TransferFailed();

    /// @notice Resolve an Agent ID name to its owner's address (read-only).
    /// @dev Normalizes first: trims whitespace, lowercases ASCII, strips a trailing ".ai".
    ///      Returns address(0) when the name is not registered.
    function resolve(string calldata name) public view returns (address) {
        bytes memory n = _normalize(name);
        if (n.length == 0) return address(0);
        return _resolve(n);
    }

    /// @notice True when the name is registered to some owner.
    function nameExists(string calldata name) external view returns (bool) {
        return resolve(name) != address(0);
    }

    /// @notice Send a BNB tip to the owner of an Agent ID name.
    /// @param name The .ai name, with or without the ".ai" suffix, any case.
    /// @param message Optional public message attached to the tip (max 280 bytes).
    function tip(string calldata name, string calldata message) external payable {
        bytes memory n = _normalize(name);
        if (n.length == 0) revert EmptyName();
        if (n.length > MAX_NAME_LEN) revert NameTooLong(n.length);
        if (bytes(message).length > MAX_MESSAGE_LEN) revert MessageTooLong(bytes(message).length);
        if (msg.value < MIN_TIP) revert TipTooSmall(msg.value, MIN_TIP);

        address recipient = _resolve(n);
        if (recipient == address(0)) revert NameNotRegistered(string(n));

        (bool ok, ) = payable(recipient).call{value: msg.value}("");
        if (!ok) revert TransferFailed();

        emit Tip(msg.sender, string(n), recipient, msg.value, message);
    }

    /// @dev Look up the owner for an already-normalized name. Returns address(0)
    ///      when the tokenId was never minted (ownerOf reverts for unminted tokens).
    function _resolve(bytes memory normalizedName) internal view returns (address) {
        uint256 tokenId = uint256(keccak256(normalizedName));
        try REGISTRY.ownerOf(tokenId) returns (address owner) {
            return owner;
        } catch {
            return address(0);
        }
    }

    /// @dev Normalize a name: trim leading/trailing whitespace (space/tab/CR/LF),
    ///      lowercase ASCII A-Z, then strip a trailing ".ai" if present.
    ///      Returns the normalized name as bytes (empty when nothing is left).
    function _normalize(string calldata name) internal pure returns (bytes memory) {
        bytes calldata raw = bytes(name);
        uint256 start = 0;
        uint256 end = raw.length;
        while (start < end && _isSpace(raw[start])) start++;
        while (end > start && _isSpace(raw[end - 1])) end--;
        if (start >= end) return new bytes(0);

        bytes memory out = new bytes(end - start);
        for (uint256 i = start; i < end; i++) {
            bytes1 c = raw[i];
            if (c >= 0x41 && c <= 0x5A) c = bytes1(uint8(c) + 32); // A-Z -> a-z
            out[i - start] = c;
        }
        // Strip a trailing ".ai" suffix (already lowercased). A bare ".ai"
        // with no name left strips to empty, which callers treat as no name.
        if (out.length >= 3 && out[out.length - 3] == 0x2E && out[out.length - 2] == 0x61 && out[out.length - 1] == 0x69) {
            bytes memory stripped = new bytes(out.length - 3);
            for (uint256 i = 0; i < stripped.length; i++) stripped[i] = out[i];
            return stripped;
        }
        return out;
    }

    function _isSpace(bytes1 c) internal pure returns (bool) {
        return c == 0x20 || c == 0x09 || c == 0x0A || c == 0x0D;
    }
}
