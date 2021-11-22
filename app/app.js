/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const { buildCAClient, registerAndEnrollUser, enrollAdmin, registerAndEnrollFarmer, registerAndEnrollRetailer } = require('./CAUtil');
//../../test-application/javascript/CAUtil.js
const { buildCCPOrg1, buildWallet, buildCCPOrg2 } = require('./AppUtil');//  ../../test-application/javascript/AppUtil.js

const channelName = 'mychannel';
const chaincodeName = 'try';
const mspOrg1 = 'Org1MSP';
const mspOrg2 = 'Org2MSP';
const walletPath1 = path.join(__dirname, 'wallet/org1');
const walletPath2 = path.join(__dirname, 'wallet/org2');

let org1UserId = 'Farmer';
let org2UserId = 'Retailer';


const RED = '\x1b[31m\n';
const GREEN = '\x1b[32m\n';
const RESET = '\x1b[0m';
const memberAssetCollectionName = 'assetCollection';
const org1PrivateCollectionName = 'Org1MSPPrivateCollection';
const org2PrivateCollectionName = 'Org2MSPPrivateCollection';

function doFail(msgString) {
    console.error(`${RED}\t${msgString}${RESET}`);
    process.exit(1);
}




function makeid(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * 
 charactersLength));
   }
   return result;
}

let temp=makeid(1);
org1UserId+=temp;
org2UserId+=temp;

function prettyJSONString(inputString) {
	return JSON.stringify(JSON.parse(inputString), null, 2);
}



async function initContractFromOrg1Identity(org1UserId) {
	console.log(`${GREEN}--> Fabric client user & Gateway init: Using Org1 identity to Org1 Peer${RESET}`);
    // build an in memory object with the network configuration (also known as a connection profile)
    const ccpOrg1 = buildCCPOrg1();

    // build an instance of the fabric ca services client based on
    // the information in the network configuration
    const caOrg1Client = buildCAClient(FabricCAServices, ccpOrg1, 'ca.org1.example.com');

    // setup the wallet to cache the credentials of the application user, on the app server locally
    const walletPathOrg1 = path.join(__dirname, 'wallet/org1');
    const walletOrg1 = await buildWallet(Wallets, walletPathOrg1);

    // in a real application this would be done on an administrative flow, and only once
    // stores admin identity in local wallet, if needed
    await enrollAdmin(caOrg1Client, walletOrg1, mspOrg1);
    // register & enroll application user with CA, which is used as client identify to make chaincode calls
    // and stores app user identity in local wallet
    // In a real application this would be done only when a new user was required to be added
    // and would be part of an administrative flow
    await registerAndEnrollFarmer(caOrg1Client, walletOrg1, mspOrg1, org1UserId, 'org1.department1');

    try {
        // Create a new gateway for connecting to Org's peer node.
        const gatewayOrg1 = new Gateway();
        //connect using Discovery enabled
        await gatewayOrg1.connect(ccpOrg1,
            { wallet: walletOrg1, identity: org1UserId, discovery: { enabled: true, asLocalhost: true } });

        return gatewayOrg1;
    } catch (error) {
        console.error(`Error in connecting to gateway: ${error}`);
        process.exit(1);
    }
}

async function initContractFromOrg2Identity() {
	console.log(`${GREEN}--> Fabric client user & Gateway init: Using Org1 identity to Org2 Peer${RESET}`);
    const ccpOrg2 = buildCCPOrg2();
    const caOrg2Client = buildCAClient(FabricCAServices, ccpOrg2, 'ca.org2.example.com');

    const walletPathOrg2 = path.join(__dirname, 'wallet/org2');
    const walletOrg2 = await buildWallet(Wallets, walletPathOrg2);

    await enrollAdmin(caOrg2Client, walletOrg2, mspOrg2);
    await registerAndEnrollRetailer(caOrg2Client, walletOrg2, mspOrg2, org2UserId, 'org2.department1');

    try {
        // Create a new gateway for connecting to Org's peer node.
        const gatewayOrg2 = new Gateway();
        await gatewayOrg2.connect(ccpOrg2,
            { wallet: walletOrg2, identity: org2UserId, discovery: { enabled: true, asLocalhost: true } });

        return gatewayOrg2;
    } catch (error) {
        console.error(`Error in connecting to gateway: ${error}`);
        process.exit(1);
    }
}
/*============================Helper functions for phase 3==========================*/

async function readBidPrice(assetKey, org, contract) {
	console.log(`${GREEN}--> Evaluate Transaction: GetAssetBidPrice, - ${assetKey} from organization ${org}${RESET}`);
	try {
		const resultBuffer = await contract.evaluateTransaction('GetAssetBidPrice', assetKey);
		const asset = JSON.parse(resultBuffer.toString('utf8'));
		console.log(`*** Result: GetAssetBidPrice, ${JSON.stringify(asset)}`);

	} catch (evalError) {
		console.log(`*** Failed evaluateTransaction GetAssetBidPrice: ${evalError}`);
	}
}

async function readSalePrice(assetKey, org, contract) {
	console.log(`${GREEN}--> Evaluate Transaction: GetAssetSalesPrice, - ${assetKey} from organization ${org}${RESET}`);
	try {
		const resultBuffer = await contract.evaluateTransaction('GetAssetSalesPrice', assetKey);
		const asset = JSON.parse(resultBuffer.toString('utf8'));
		console.log(`*** Result: GetAssetSalesPrice, ${JSON.stringify(asset)}`);

	} catch (evalError) {
		console.log(`*** Failed evaluateTransaction GetAssetSalesPrice: ${evalError}`);
	}
}

// This is not a real function for an application, this simulates when two applications are running
// from different organizations and what they would see if they were to both query the asset
async function readAssetByBothOrgs(assetKey, ownerOrg, contractOrg1, contractOrg2) {
	console.log(`${GREEN}--> Evaluate Transactions: ReadAsset, - ${assetKey} should be owned by ${ownerOrg}${RESET}`);
	let resultBuffer;
	resultBuffer = await contractOrg1.evaluateTransaction('ReadAsset', assetKey);
	//checkAsset('Org1', resultBuffer, ownerOrg);
	resultBuffer = await contractOrg2.evaluateTransaction('ReadAsset', assetKey);
	//checkAsset('Org2', resultBuffer, ownerOrg);
}

/*======================================================================================= */
async function main() {
	try {
        /** ******* Fabric client init: Using Org1 identity to Org1 Peer ********** */
        const gatewayOrg1 = await initContractFromOrg1Identity(org1UserId);
        const networkOrg1 = await gatewayOrg1.getNetwork(channelName);
        const contractOrg1 = networkOrg1.getContract(chaincodeName);
        contractOrg1.addDiscoveryInterest({ name: chaincodeName, collectionNames: [memberAssetCollectionName, org1PrivateCollectionName] });


        /** ~~~~~~~ Fabric client init: Using Org2 identity to Org2 Peer ~~~~~~~ */
        const gatewayOrg2 = await initContractFromOrg2Identity();
        const networkOrg2 = await gatewayOrg2.getNetwork(channelName);
        const contractOrg2 = networkOrg2.getContract(chaincodeName);
        contractOrg2.addDiscoveryInterest({ name: chaincodeName, collectionNames: [memberAssetCollectionName, org2PrivateCollectionName] });

		try {


			let randomNumber = Math.floor(Math.random() * 1000) + 1;
            // use a random key so that we can run multiple times
            let privateAssetID = `asset${randomNumber}`;
            let transaction;
			console.log('------------------------Here Farmer Controls the App ------------------------\n');

			console.log("******************Public Details of Asset Created ***********************")
            console.log('Adding Assets to work with:\n--> Submit Transaction: CreatePrivateAsset ' + privateAssetID);
            let statefulTxn = contractOrg1.createTransaction('CreateAsset');
            let result = await statefulTxn.submit(privateAssetID,'green',10);
			console.log(" Asset Was created. Public details should be present !");

			await readAssetByBothOrgs(privateAssetID, mspOrg1, contractOrg1, contractOrg2);


			console.log('\n--> This is going to return the details of ',privateAssetID);
			result = await contractOrg1.evaluateTransaction('ReadAsset', privateAssetID);
			console.log(`*** Result: ${prettyJSONString(result.toString())}`);

			

			console.log('\n--> Evaluate Transaction: AssetExists, function eturns "true" if an asset with given assetID exist');
			result = await contractOrg1.evaluateTransaction('AssetExists', privateAssetID);
			console.log(`*** Result: ${prettyJSONString(result.toString())}`);
			console.log("Now we are going to read all assets including ",privateAssetID)
			result = await contractOrg1.evaluateTransaction('GetAllAssets');
			console.log(`*** Result: ${prettyJSONString(result.toString())}`);


			try {
				// Agree to a sell by Org1
				const asset_price = {
					asset_id: privateAssetID,
					price: 110,
					trade_id: randomNumber.toString()
				};
				const asset_price_string =  Buffer.from(JSON.stringify(asset_price));
				console.log(`${GREEN}--> Submit Transaction: setPrice, ${privateAssetID} as Org1 - endorsed by Org1${RESET}`);
				transaction = contractOrg1.createTransaction('SetPrice');
				//transaction.setEndorsingOrganizations(mspOrg1);
				transaction.setTransient({
					asset_price:asset_price_string
				});
				await transaction.submit(privateAssetID);
				console.log(`*** Result: committed, Org1 has agreed to sell asset ${privateAssetID} for 110`);
			} catch (sellError) {
				console.log(`${RED}*** Failed: AgreeToSell - ${sellError}${RESET}`);
			}
			
            console.log('\n~~~~~~~~~~~~~~~~ As Org2 Client ~~~~~~~~~~~~~~~~');
            let buyerDetails = { assetID: privateAssetID, buyerMSP: mspOrg2 };
            console.log('\n~~~~~~~~~~~~~~~ We need to request to buy asset ~~~~~~~~~~~~~~~~');
            //make request to buy it,might have to do this before org1 sets price
            transaction = contractOrg2.createTransaction('RequestToBuy');
            transaction.submit(privateAssetID);

			
            console.log('\n--> Evaluate Transaction: ReadAsset ' + privateAssetID);
            result = await contractOrg2.evaluateTransaction('ReadAsset', privateAssetID);
            console.log(`<-- result: ${prettyJSONString(result.toString())}`);
            
            console.log("==============REQUEST TO BUY==================")
            result = await contractOrg1.evaluateTransaction('ReadRequestToBuy', privateAssetID);//
            console.log(`<-- result: ${result.toString()}`);
			console.log("Here we are going to AgreeToBuy")

			try {
				// Agree to a buy by Org2
				const asset_price = {
					asset_id: privateAssetID,
					price: 110,
					trade_id: randomNumber.toString()
				};
				const asset_price_string = JSON.stringify(asset_price);
				console.log(`${GREEN}--> Submit Transaction: AgreeToBuy, ${privateAssetID} as Org2 - endorsed by Org2${RESET}`);
				transaction = contractOrg2.createTransaction('AgreeToBuy');
				//transaction.setEndorsingOrganizations(mspOrg2);
				transaction.setTransient({
					asset_price: Buffer.from(asset_price_string)
				});
				await transaction.submit(privateAssetID);
				console.log(`*** Result: committed, Org2 has agreed to buy asset ${privateAssetID} for 110`);
			} catch (buyError) {
				console.log(`${RED}*** Failed: AgreeToBuy - ${buyError}${RESET}`);
			}

            console.log('\n**************** As Org1 Client ****************');
            // All members can send txn ReadRequestToBuy, set by Org2 above
            console.log('\n--> Evaluate Transaction: ReadRequestToBuy ' + privateAssetID);
            


            result = await contractOrg1.evaluateTransaction('ReadRequestToBuy', privateAssetID);//should change how AgreeToTransfer is implemented
            console.log(`<-- result: ${prettyJSONString(result.toString())}`);

            // Transfer the asset to Org2 //
            // To transfer the asset, the owner needs to pass the MSP ID of new asset owner, and initiate the transfer
            console.log('\n--> Submit Transaction: TransferRequestedAsset ' + privateAssetID);

            statefulTxn = contractOrg1.createTransaction('TransferRequestedAsset');
            let tmapData = Buffer.from(JSON.stringify(buyerDetails));
           // transaction.setEndorsingOrganizations(mspOrg1,mspOrg2);
            statefulTxn.setTransient({
                asset_owner: tmapData
            });
            result = await statefulTxn.submit();
            


			console.log('\n--> We are going to read privateAssetAfter after transfer to org2');
			result = await contractOrg1.evaluateTransaction('ReadAsset', privateAssetID);
			console.log(`*** Result: ${prettyJSONString(result.toString())}`);

			console.log('\n--> We are going to read Bid Price from buyers private collection');
			readBidPrice(privateAssetID,mspOrg2,contractOrg2)
			console.log(`*** Result: ${prettyJSONString(result.toString())}`);



            // ReadAssetPrivateDetails reads data from Org's private collection: Should return empty
            // result = await contractOrg1.evaluateTransaction('ReadAssetPrivateDetails', org1PrivateCollectionName, privateAssetID);
            // console.log(`<-- result: ${result.toString()}`);//had to remove prettyJSONString cause empty json cannot be parsed
            // if (result && result.length > 0) {
            //     doFail('Expected empty data from ReadAssetPrivateDetails');
            // }

			console.log('\n~~~~~~~~~~~~~~~~ As Org2 Client ~~~~~~~~~~~~~~~~');

			
			console.log('\n--> Evaluate Transaction: GetAssetHistory, get the history of ',privateAssetID);
			result = await contractOrg1.evaluateTransaction('GetAssetHistory', privateAssetID);
			console.log(`*** Result: ${prettyJSONString(result.toString())}`);



			gatewayOrg1.disconnect();
			console.log('------------------------Farmer user end here -----------------------------------\n');
			
			
			gatewayOrg2.disconnect();
		} finally {
			// Disconnect from the gateway when the application is closing
			// This will close all connections to the network
			
			
		}
	} catch (error) {
		console.error(`******** FAILED to run the application: ${error}`);
	}
}

main();
