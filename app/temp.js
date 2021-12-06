/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const { buildCAClient, registerAndEnrollUser, enrollAdmin,registerAndEnrollFarmer, registerAndEnrollRetailer } = require('./CAUtil')
const { buildCCPOrg1, buildWallet, buildCCPOrg2,buildCCPOrg3 } = require('./AppUtil');
const channelName = 'mychannel';
const chaincodeName = 'try';
const mspOrg1 = 'Org1MSP';
const mspOrg2 = 'Org2MSP';
const mspOrg3 = 'Org3MSP';


let org1UserId = 'Farmer';
let org2UserId = 'Retailer';
let org3UserId = 'Client';


/*----------------------------------code for phase 3---------------------------------*/
const RED = '\x1b[31m\n';
const GREEN = '\x1b[32m\n';
const RESET = '\x1b[0m';
const assetCollection = 'assetCollection';
const sharedCollectionOrg2Org3 = 'assetCollection23';


function doFail(msgString) {
    console.error(`${RED}\t${msgString}${RESET}`);
    process.exit(1);
}



//-----------------------------end of code------------------------
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

// let temp=makeid(1);
// org1UserId+=temp;
// org2UserId+=temp;
// org3UserId+=temp;

org1UserId+="b";
org2UserId+="b";
org3UserId+="b";
function prettyJSONString(inputString) {
	return JSON.stringify(JSON.parse(inputString), null, 2);
}



async function initContractFromOrg1Identity() {
    console.log('\n--> Fabric client user & Gateway init: Using Org1 identity to Org1 Peer');
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
    console.log('\n--> Fabric client user & Gateway init: Using Org2 identity to Org2 Peer');
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

async function initContractFromOrg3Identity() {
    console.log('\n--> Fabric client user & Gateway init: Using Org3 identity to Org3 Peer');
    // build an in memory object with the network configuration (also known as a connection profile)
    const ccpOrg3 = buildCCPOrg3();

 
    const caOrg3Client = buildCAClient(FabricCAServices, ccpOrg3, 'ca.org3.example.com');

    const walletPathOrg3 = path.join(__dirname, 'wallet/org3');
    const walletOrg3 = await buildWallet(Wallets, walletPathOrg3);


    await enrollAdmin(caOrg3Client, walletOrg3, mspOrg3);

    await registerAndEnrollUser(caOrg3Client, walletOrg3, mspOrg3, org3UserId, 'org3.department1');

    try {
        // Create a new gateway for connecting to Org's peer node.
        const gatewayOrg3 = new Gateway();
        //connect using Discovery enabled
        await gatewayOrg3.connect(ccpOrg3,
            { wallet: walletOrg3, identity: org3UserId, discovery: { enabled: true, asLocalhost: true } });

        return gatewayOrg3;
    } catch (error) {
        console.error(`Error in connecting to gateway: ${error}`);
        process.exit(1);
    }
}

/*============================Helper functions for phase 3==========================*/

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
/*======================================================================================= */
async function main() {
	try {
        
        let statefulTxn;
        let tmapData;
        /** ******* Fabric client init: Using Org1 identity to Org1 Peer ********** */
        const gatewayOrg1 = await initContractFromOrg1Identity(org1UserId);
        const networkOrg1 = await gatewayOrg1.getNetwork(channelName);
        const contractOrg1 = networkOrg1.getContract(chaincodeName);
        contractOrg1.addDiscoveryInterest({ name: chaincodeName, collectionNames: [assetCollection] });


        /** ~~~~~~~ Fabric client init: Using Org2 identity to Org2 Peer ~~~~~~~ */
        const gatewayOrg2 = await initContractFromOrg2Identity();
        const networkOrg2 = await gatewayOrg2.getNetwork(channelName);
        const contractOrg2 = networkOrg2.getContract(chaincodeName);
        contractOrg2.addDiscoveryInterest({ name: chaincodeName, collectionNames: [assetCollection, sharedCollectionOrg2Org3] });
        
        /** ~~~~~~~ Fabric client init: Using Org3 identity to Org3 Peer ~~~~~~~ */
        const gatewayOrg3 = await initContractFromOrg3Identity();
        const networkOrg3 = await gatewayOrg3.getNetwork(channelName);
        const contractOrg3 = networkOrg3.getContract(chaincodeName);
        contractOrg3.addDiscoveryInterest({ name: chaincodeName, collectionNames: [assetCollection, sharedCollectionOrg2Org3] });


		try {

			let randomNumber = 3//Math.floor(Math.random() * 1000) + 1;
            // use a random key so that we can run multiple times
            // let assetID = `asset${randomNumber}`;
            let assetID = `asset${randomNumber}`;
            let transaction;
			console.log('------------------------Here Farmer Controls the App ------------------------\n');



			console.log("******************Public Details of Asset Created ***********************\n")
            console.log('Adding Assets to work with:\n--> Submit Transaction: Create Asset ' + assetID);
            statefulTxn = contractOrg1.createTransaction('CreateAsset');
            statefulTxn.setEndorsingOrganizations(mspOrg1);
            let result = await statefulTxn.submit(assetID,'green',10,"apples");
			console.log(" Asset Was created. Public details should be present !");
            await sleep(3000);



			// console.log('\n--> This is going to return the details of ',assetID);
			result = await contractOrg1.evaluateTransaction('ReadAsset', assetID);//should delete let
			console.log(`*** Result: ${prettyJSONString(result.toString())}`);
            await sleep(3000);

            console.log("=========Here Org1 agrees to sell ",assetID)
			try {
				// Agree to a sell by Org1
				const asset_price = {
					asset_id: assetID,
					price: 110,
					trade_id: randomNumber.toString()
				};
				const asset_price_string =  Buffer.from(JSON.stringify(asset_price));
				console.log(`${GREEN}--> Submit Transaction: setPrice, ${assetID} as Org1 - endorsed by Org1${RESET}`);
				transaction = contractOrg1.createTransaction('SetPrice');
                transaction.setEndorsingOrganizations(mspOrg1);
				transaction.setTransient({
					asset_price:asset_price_string
				});
				await transaction.submit(assetID);
				console.log(`*** Result: committed, Org1 has agreed to sell asset ${assetID} for 110`);
			} catch (sellError) {
				console.log(`${RED}*** Failed: AgreeToSell - ${sellError}${RESET}`);
			}
			await sleep(3000);



            console.log('\n~~~~~~~~~~~~~~~~ As Org2 Client ~~~~~~~~~~~~~~~~');
            let buyerDetails = { assetID: assetID, buyerMSP: mspOrg2 };
            console.log('\n~~~~~~~~~~~~~~~ We need to request to buy asset ~~~~~~~~~~~~~~~~');
            //make request to buy it,might have to do this before org1 sets price
            transaction = contractOrg2.createTransaction('RequestToBuy');
            transaction.setEndorsingOrganizations(mspOrg2);
            transaction.submit(assetID);
            await sleep(3000);


            console.log('\n~~~~~~~~~~~~~~~~ As Org2 Client ~~~~~~~~~~~~~~~~');
            console.log('\n~~~~~~~~~~~~~~~ We need to request to buy asset ~~~~~~~~~~~~~~~~');
            //make request to buy it,might have to do this before org1 sets price
            transaction = contractOrg2.createTransaction('RequestToBuy');
            transaction.setEndorsingOrganizations(mspOrg2);
            transaction.submit(assetID);
            await sleep(3000);

			
            console.log('\n--> Evaluate Transaction: ReadAsset ' + assetID);
            result = await contractOrg2.evaluateTransaction('ReadAsset', assetID);
            console.log(`<-- result: ${prettyJSONString(result.toString())}`);
            await sleep(4000);


            // console.log("==============REQUEST TO BUY==================")
            // result = await contractOrg1.evaluateTransaction('ReadRequestToBuy', assetID);//
            // console.log(`<-- result: ${result.toString()}`);
            // await sleep(3000);


			console.log("===========Here we are going to AgreeToBuy as Org2===================");
			try {
				// Agree to a buy by Org2
				const asset_price = {
					asset_id: assetID,
					price: 110,
					trade_id: randomNumber.toString()
				};
				const asset_price_string = JSON.stringify(asset_price);
				console.log(`${GREEN}--> Submit Transaction: AgreeToBuy, ${assetID} as Org2 - endorsed by Org2${RESET}`);
				transaction = contractOrg2.createTransaction('AgreeToBuy');
				transaction.setEndorsingOrganizations(mspOrg2);//mspOrg1
				transaction.setTransient({
					asset_price: Buffer.from(asset_price_string)
				});
				await transaction.submit(assetID);
				console.log(`*** Result: committed, Org2 has agreed to buy asset ${assetID} for 110`);
			} catch (buyError) {
				console.log(`${RED}*** Failed: AgreeToBuy - ${buyError}${RESET}`);
			}
            await sleep(3000);


            console.log('\n**************** As Org1 Client ****************');
            // All members can send txn ReadRequestToBuy, set by Org2 above
            console.log('\n--> Evaluate Transaction: ReadRequestToBuy ' + assetID);
            result = await contractOrg1.evaluateTransaction('ReadRequestToBuy', assetID,assetCollection);//should change how AgreeToTransfer is implemented
            console.log(`<-- result: ${prettyJSONString(result.toString())}`);
            await sleep(3000);



            // Transfer the asset to Org2 //
            // To transfer the asset, the owner needs to pass the MSP ID of new asset owner, and initiate the transfer
            console.log('\n--> Submit Transaction: TransferRequestedAsset ' + assetID);
            statefulTxn = contractOrg1.createTransaction('TransferRequestedAsset');
            let tmapData = Buffer.from(JSON.stringify(buyerDetails));
            statefulTxn.setEndorsingOrganizations(mspOrg1);
            statefulTxn.setTransient({
                asset_owner: tmapData
            });
            result = await statefulTxn.submit();
            await sleep(3000);


			console.log('\n--> We are going to read privateAssetAfter after transfer to org2');
			result = await contractOrg1.evaluateTransaction('ReadAsset', assetID);
			console.log(`*** Result: ${prettyJSONString(result.toString())}`);
            await sleep(3000);


			console.log('\n~~~~~~~~~~~~~~~~ As Org2 Client ~~~~~~~~~~~~~~~~');
			console.log('\n--> Evaluate Transaction: GetAssetHistory, get the history of ',assetID);
			result = await contractOrg1.evaluateTransaction('GetAssetHistory', assetID);
			console.log(`*** Result: ${prettyJSONString(result.toString())}`);
            await sleep(3000);

            console.log('\n~~~~~~~~~~~~~~~ We have to delete previous buy request ~~~~~~~~~~~~~~~~');
            transaction = contractOrg2.createTransaction('DeleteBuyRequest');
            transaction.setEndorsingOrganizations(mspOrg2);
            transaction.submit(assetID,assetCollection);
            await sleep(3000);



            //=====Process of transfer from Org2=>Org3
            console.log(`${GREEN}\n========Here the process for the tranfer of asset from reatailer to org3 client========================= ${RESET}`);
            await sleep(3000);


            console.log('\n~~~~~~~~~~~~~~~~ As Org3 Client ~~~~~~~~~~~~~~~~\n');
            buyerDetails = { assetID: assetID, buyerMSP: mspOrg3 };
            console.log('\n~~~~~~~~~~~~~~~ We need to request to buy asset ~~~~~~~~~~~~~~~~');
            //make request to buy it,might have to do this before org1 sets price
            transaction = contractOrg3.createTransaction('RequestToBuy');
            transaction.setEndorsingOrganizations(mspOrg3);
            transaction.submit(assetID);
            await sleep(3000);
            console.log('\n~~~~~~~~~~~~~~~ request to buy asset was succesfull~~~~~~~~~~~~~~~~');
			
            await sleep(2000);
            console.log("=====This reads the request to buy from org3")
            result = await contractOrg2.evaluateTransaction('ReadRequestToBuy', assetID,sharedCollectionOrg2Org3);//should change how AgreeToTransfer is implemented
            await sleep(3000);
            console.log(`<-- result: ${prettyJSONString(result.toString())}`);
            await sleep(1000);

            await sleep(2000);
            console.log("==============Agree To sell from Org2==================")
            try {
				// Agree to a sell by Org2
				const asset_price = {
					asset_id: assetID,
					price: 110,
					trade_id: randomNumber.toString()
				};
				const asset_price_string =  Buffer.from(JSON.stringify(asset_price));
				console.log(`${GREEN}--> Submit Transaction: setPrice, ${assetID} as Org2 - endorsed by Org2${RESET}`);
				transaction = contractOrg2.createTransaction('SetPrice');
                transaction.setEndorsingOrganizations(mspOrg2);
				transaction.setTransient({
					asset_price:asset_price_string
				});
				await transaction.submit(assetID);
				console.log(`*** Result: committed, Org2 has agreed to sell asset ${assetID} for 110`);
			} catch (sellError) {
				console.log(`${RED}*** Failed: AgreeToSell - ${sellError}${RESET}`);
			}
            await sleep(2000);



            console.log("==============Agree TO BUY from org3==================")
			try {
				// Agree to a buy by Org3
				const asset_price = {
					asset_id: assetID,
					price: 110,
					trade_id: randomNumber.toString()
				};
				const asset_price_string = JSON.stringify(asset_price);
				console.log(`${GREEN}--> Submit Transaction: AgreeToBuy, ${assetID} as Org3 - endorsed by Org3${RESET}`);
				transaction = contractOrg3.createTransaction('AgreeToBuy');
                transaction.setEndorsingOrganizations(mspOrg3);
				transaction.setTransient({
					asset_price: Buffer.from(asset_price_string)
				});
				await transaction.submit(assetID);
				console.log(`*** Result: committed, Org3 has agreed to buy asset ${assetID} for 110`);
			} catch (buyError) {
				console.log(`${RED}*** Failed: AgreeToBuy - ${buyError}${RESET}`);
			}
            await sleep(3000);




            console.log('\n**************** As Org2Client ****************');
            // All members can send txn ReadRequestToBuy, set by Org2 above
            console.log('\n--> Evaluate Transaction: ReadRequestToBuy ' + assetID);
            result = await contractOrg2.evaluateTransaction('ReadRequestToBuy', assetID,sharedCollectionOrg2Org3);//should change how AgreeToTransfer is implemented
            console.log(`<-- result: ${prettyJSONString(result.toString())}`);
            await sleep(3000);



            // Transfer the asset to Org3 //
            // To transfer the asset, the owner needs to pass the MSP ID of new asset owner, and initiate the transfer
            console.log('\n--> Submit Transaction: TransferRequestedAsset ' + assetID);
            statefulTxn = contractOrg2.createTransaction('TransferRequestedAsset');
            statefulTxn.setEndorsingOrganizations(mspOrg2);
            tmapData = Buffer.from(JSON.stringify(buyerDetails));
            statefulTxn.setTransient({
                asset_owner: tmapData
            });
            result = await statefulTxn.submit();
            await sleep(3000);

            


			console.log('\n--> We are going to read privateAssetAfter after transfer to org3');
			result = await contractOrg2.evaluateTransaction('ReadAsset', assetID);
			console.log(`*** Result: ${prettyJSONString(result.toString())}`);
            await sleep(3000);



		    console.log('\n~~~~~~~~~~~~~~~~ As Org3 Client ~~~~~~~~~~~~~~~~');
			console.log('\n--> Evaluate Transaction: GetAssetHistory, get the history of ',assetID);
			result = await contractOrg2.evaluateTransaction('GetAssetHistory', assetID);
			console.log(`*** Result: ${prettyJSONString(result.toString())}`);



			// gatewayOrg1.disconnect();
			// gatewayOrg2.disconnect();
            // gatewayOrg3.disconnect();
		} finally {
			// Disconnect from the gateway when the application is closing
			// This will close all connections to the network
            gatewayOrg1.disconnect();
			gatewayOrg2.disconnect();
            gatewayOrg3.disconnect();
			
		}
	} catch (error) {
		console.error(`******** FAILED to run the application: ${error}`);
	}
}

main();
