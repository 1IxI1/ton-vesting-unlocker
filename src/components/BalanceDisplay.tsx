import { useEffect, useState } from 'react';
import { useTonConnectUI } from '@tonconnect/ui-react';
import QRCode from 'qrcode';
import { formatTON, shortenAddress, generateWithdrawDeepLink, formatContractAddress } from '../utils/helpers';
import type { WalletBalance } from '../contracts/types';
import { LOCKER_ADDRESSES, WITHDRAW_AMOUNT } from '../utils/constants';
import { TonApiClient } from '../api/tonApiClient';
import { beginCell } from '@ton/core';

interface BalanceDisplayProps {
  address: string;
  isManual: boolean;
  onDisconnect: () => void;
  isTestnet: boolean;
}

export function BalanceDisplay({ address, isManual, onDisconnect, isTestnet }: BalanceDisplayProps) {
  const [tonConnectUI] = useTonConnectUI();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [qrCode, setQrCode] = useState<string>('');

  const lockerAddress = isTestnet ? LOCKER_ADDRESSES.testnet : LOCKER_ADDRESSES.mainnet;
  // Use bounceable for locker contract
  const formattedLockerAddress = formatContractAddress(lockerAddress, isTestnet);

  useEffect(() => {
    loadBalance();

    // Set up auto-refresh interval
    const intervalId = setInterval(() => {
      // Only auto-refresh if modal is not open
      if (!showWithdrawModal) {
        loadBalance();
      }
    }, 30000); // 30 seconds

    // Cleanup interval on unmount or when dependencies change
    return () => clearInterval(intervalId);
  }, [address, isTestnet, showWithdrawModal]);

  const loadBalance = async () => {
    try {
      // Only show full loading state on initial load
      if (!balance) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);
      
      const client = new TonApiClient(isTestnet);
      const balanceData = await client.getWalletBalance(lockerAddress, address);
      setBalance(balanceData);
    } catch (err) {
      console.error('Failed to load balance:', err);
      setError('Failed to load balance. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!balance || balance.availableToWithdraw === 0n) return;

    if (isManual) {
      // generate QR code for manual withdrawal
      const deepLink = generateWithdrawDeepLink(lockerAddress, isTestnet);
      const qr = await QRCode.toDataURL(deepLink);
      setQrCode(qr);
      setShowWithdrawModal(true);
    } else {
      // use TON Connect to send transaction
      try {
        const body = beginCell()
          .storeUint(0, 32) // op
          .storeStringTail('w')
          .endCell();

        await tonConnectUI.sendTransaction({
          messages: [
            {
              address: formattedLockerAddress,
              amount: WITHDRAW_AMOUNT.toString(),
              payload: body.toBoc().toString('base64'),
            },
          ],
          validUntil: Date.now() + 5 * 60 * 1000, // 5 minutes
        });

        // reload balance after a delay
        setTimeout(() => loadBalance(), 5000);
      } catch (err) {
        console.error('Transaction failed:', err);
        setError('Transaction failed. Please try again.');
      }
    }
  };

  const handleDisconnect = async () => {
    if (!isManual && tonConnectUI.connected) {
      await tonConnectUI.disconnect();
    }
    onDisconnect();
  };

  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
          <p className="text-center mt-4 text-gray-600">Loading balance...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <p className="text-sm text-gray-500">Connected Wallet</p>
              <p className="font-mono font-semibold">{shortenAddress(address, isTestnet)}</p>
            </div>
            <button
              onClick={handleDisconnect}
              className="text-sm text-red-500 hover:text-red-600"
            >
              Back
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-4">Your Vesting Balance</h2>
              
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Available to Withdraw</p>
                  <p className={`text-2xl font-bold ${balance && balance.availableToWithdraw > 0n ? 'text-green-600' : 'text-gray-800'}`}>
                    {balance ? formatTON(balance.availableToWithdraw) : '0'} TON
                  </p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Still Locked</p>
                  <p className="text-2xl font-bold text-gray-800">
                    {balance ? formatTON(balance.stillLocked) : '0'} TON
                  </p>
                </div>

                <div className="text-sm text-gray-500">
                  <p>Total Deposited: {balance ? formatTON(balance.totalUserDeposit) : '0'} TON</p>
                  <p>Total with Rewards: {balance ? formatTON(balance.totalUserDepositAndReward) : '0'} TON</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {balance && balance.availableToWithdraw > 0n && (
                <button
                  onClick={handleWithdraw}
                  className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  Withdraw Available
                </button>
              )}

              <button
                onClick={loadBalance}
                disabled={refreshing}
                className={`w-full border border-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 ${
                  refreshing ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-400'
                }`}
              >
                {refreshing && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700"></div>
                )}
                <span>{refreshing ? 'Refreshing...' : 'Refresh Balance'}</span>
                {/* <span className="text-xs text-gray-500">(auto-updates every 30s)</span> */}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* manual withdrawal modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Withdraw Instructions</h3>
            
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-2">Send to:</p>
                <p 
                  className="font-mono text-xs break-all cursor-pointer hover:bg-gray-100 p-2 rounded transition-colors"
                  onClick={() => navigator.clipboard.writeText(formattedLockerAddress)}
                  title="Click to copy"
                >
                  {formattedLockerAddress}
                </p>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-2">Amount:</p>
                <p 
                  className="font-semibold cursor-pointer hover:bg-gray-100 p-2 rounded transition-colors"
                  onClick={() => navigator.clipboard.writeText('1')}
                  title="Click to copy"
                >
                  1 TON
                </p>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-2">Comment:</p>
                <p 
                  className="font-mono font-semibold cursor-pointer hover:bg-gray-100 p-2 rounded transition-colors"
                  onClick={() => navigator.clipboard.writeText('w')}
                  title="Click to copy"
                >
                  w
                </p>
              </div>

              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">Or scan QR code:</p>
                <img src={qrCode} alt="Withdrawal QR Code" className="mx-auto" />
              </div>
            </div>

            <button
              onClick={() => setShowWithdrawModal(false)}
              className="w-full mt-6 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}