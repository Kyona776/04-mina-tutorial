import '../styles/globals.css'
import type { AppProps } from 'next/app'
import type MinaProvider from '@aurowallet/mina-provider';

import './reactCOIServiceWorker';
import ZkappWorkerClient from "./zkappWorkerClient";

import { useState, useEffect } from "react";

import {
  PublicKey,
  PrivateKey,
  Field,
  Mina
} from "snarkyjs";


let transactionFee = 0.1;

export default function App({ Component, pageProps }: AppProps) {
  let [state, setState] = useState({
    zkappWorkerClient: null as null | ZkappWorkerClient,
    hasWallet: null as null | boolean,
    hasBeenSetup: false,
    accountExists: false,
    currentNum: null as null | Field,
    publicKey: null as null | PublicKey,
    zkappPublicKey: null as null | PublicKey,
    creatingTransaction: false,
  });


  useEffect(() => {
    (async () => {
      if (!state.hasBeenSetup) {
        const zkappWorkerClient = new ZkappWorkerClient();

        console.log("Loading SnarkyJs");
        await zkappWorkerClient.loadSnarkyJS();
        console.log("Done");

        await zkappWorkerClient.setActiveInstanceToBerkeley();
        
        const mina: MinaProvider|null|undefined = (window as any).mina;
        
        if (mina == null) {
          setState({ ...state, hasWallet: false });
          return;
        }
        
        const publicKeyBase58: string = (await mina.requestAccounts())[0];
        const publicKey = PublicKey.fromBase58(publicKeyBase58);
        
        console.log("using key", publicKey.toBase58());
        
        console.log("checking if account exists...");
        const res = await zkappWorkerClient.fetchAccount({ publicKey: publicKey });
        console.log(res.account);
        const accountExists = res.error == undefined;

        await zkappWorkerClient.loadContract();

        console.log("compling...");
        await zkappWorkerClient.compileContract();

        console.log("zkApp compiled");

        const zkappPublicKey = PublicKey.fromBase58(
					"B62qjWUofRaBpJypv6DVcVuLic6KkJhBFTwJc4LanS3nMbebGLfetLf"
				);
        
        await zkappWorkerClient.initZkappInstance(zkappPublicKey);

        console.log('getting zkApp state');
        const resc = await zkappWorkerClient.fetchAccount({ publicKey: zkappPublicKey });
        if (resc.error == undefined) {
          console.log(resc.account);
        } else {
          return;
        }
        const currentNum = await zkappWorkerClient.getNum();
        console.log('current number:', currentNum.toString());
        
        setState({
          ...state,
          zkappWorkerClient,
          hasWallet: true,
          hasBeenSetup: true,
          publicKey,
          zkappPublicKey,
          accountExists,
          currentNum
        });
      }
    })();

  }, []);


  useEffect(() => {
    (async () => {
      if (state.hasBeenSetup && !state.accountExists) {
        for (; ;) {
          console.log("checking if account exists...");
          // console.log(state.publicKey);
          const res = await state.zkappWorkerClient!.fetchAccount({ publicKey: state.publicKey! });
          // console.log(res.account);
          if (!!res.account) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        setState({ ...state, accountExists: true });
      }
    })();

  }, [state.hasBeenSetup]);

  const onSendTransaction = async () => {
    setState({ ...state, creatingTransaction: true });
    console.log("sending Transaction...");

    await state.zkappWorkerClient!.fetchAccount({ publicKey: state.publicKey! });

    await state.zkappWorkerClient!.createUpdateTransaction();

    console.log("creating proof...");
    await state.zkappWorkerClient!.proveUpdateTransaction();

    console.log("get trainsaction Json");
    const transactionJson = await state.zkappWorkerClient!.getTransactionJSON();
    
    console.log(transactionJson);

    console.log("requesting send transaction");
    const mina: MinaProvider = await (window as any).mina;
    if (!mina.isConnected()) {
      console.log('wallet is not connected');
      setState({
				...state,
				creatingTransaction: false,
      });
      return;
    }
    const { hash } = await(window as any).mina.sendTransaction({
			transaction: transactionJson,
			feePayer: {
				fee: transactionFee,
				memo: "",
			},
		});

    console.log(
			"See transaction at https://berkeley.minaexplorer.com/transaction/" + hash
    );
    
    setState({
      ...state, creatingTransaction: false
    });
  }

  const onRefreshCurrentNum = async () => {
		console.log("fetching account");
		await state.zkappWorkerClient!.fetchAccount({
			publicKey: state.publicKey!,
		});

		console.log("refreshing current num");
		const currentNum = await state.zkappWorkerClient!.getNum();
		console.log("current state: " + currentNum.toString());

		setState({
			...state,
			currentNum: currentNum,
		});
	};

  let hasWallet;
  if (state.hasBeenSetup != null && !state.hasWallet) {
    const auroLink = "https://www.aurowallet.com/";
    const auroLinkElem = <a href={auroLink} target="_blank" rel="noreferrer">{auroLink}</a>
    hasWallet = (
			<div>
				{" "}
				Could not find a wallet. Install Auro wallet here: {auroLinkElem}
			</div>
		);
  }

  let setUpText = state.hasBeenSetup ? "SnarkJS Ready " : "Setting up SnarkJS";
  let setup = <div>{hasWallet}{setUpText}</div>;

  let accountDoesNotExists;
  if (state.hasBeenSetup && !state.accountExists) {
    const faucetLink = "https://faucet.minaprotocol.com/?address=" + state.publicKey!.toBase58();
    accountDoesNotExists = (
			<div>
        Account does not exist. Please visit the faucet to fund this account
        <a href={faucetLink} target="_blank" rel="noreferrer">{faucetLink}</a>
			</div>
		);
  }

  let mainContent;
  if (state.hasBeenSetup && state.accountExists) {
    mainContent = (
			<div>
				<button
					onClick={onSendTransaction}
					disabled={state.creatingTransaction}>
					Send Transaction
				</button>
				<div> Current Number in zkApp {state.currentNum!.toString()}</div>
				<button onClick={onRefreshCurrentNum}>Refresh</button>
			</div>
		);
  }
  // return <Component {...pageProps} />
  return (
		<div>
			{setup}
      {accountDoesNotExists}
      {mainContent}
		</div>
	);
}
