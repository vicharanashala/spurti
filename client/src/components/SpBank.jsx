import React from 'react';

export default function SpBank({ transactions }) {
  return (
    <section className="panel">
      <h2>SP Bank Statement</h2>
      <div className="bank">
        <div className="bank-header">
          <span>Date & time</span>
          <span>Credit</span>
          <span>Debit</span>
          <span>Balance</span>
          <span>Reason</span>
        </div>
        {transactions.map(tx => (
          <div className="bank-row" key={tx._id}>
            <span>{new Date(tx.dateTime).toLocaleString()}</span>
            <strong className="credit">{tx.appliedDelta > 0 ? `+${tx.appliedDelta}` : ''}</strong>
            <strong className="debit">{tx.appliedDelta < 0 ? tx.appliedDelta : ''}</strong>
            <b>{tx.balanceAfter}</b>
            <p>{tx.reason}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
