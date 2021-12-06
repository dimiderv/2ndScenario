package chaincode

import (
  "encoding/json"
  "fmt"
  "log"
  "bytes"
  //"github.com/hyperledger/fabric-chaincode-go/pkg/statebased"
  "github.com/hyperledger/fabric-contract-api-go/contractapi"
  //"time"
  
  //"github.com/golang/protobuf/ptypes"

  "github.com/hyperledger/fabric-chaincode-go/shim"
  
)

/*--------Phase 3 code-------------*/
const (
	typeAssetForSale     = "S"
	typeAssetBid         = "B"
)
const assetCollection = "assetCollection"
const assetCollection23 = "assetCollection23"
const requestToBuyObjectType = "BuyRequest"

type AssetPrivateDetails struct {
	ID             string `json:"assetID"`
	// ObjectType	   string `json:"objectType"`
	Price 		   int    `json:"price"`
}


type RequestToBuyObject struct {
	ID      string `json:"assetID"`
	BuyerID string `json:"buyerID"`
}



//Puts Price to Org1 implicit collection
func (s *SmartContract) SetPrice(ctx contractapi.TransactionContextInterface, assetID string) error {
	asset, err := s.ReadAsset(ctx, assetID)
	if err != nil {
		return err
	}

	clientID, err := s.GetSubmittingClientIdentity(ctx)
	if err != nil {
		return fmt.Errorf("failed to get verified OrgID: %v", err)
	}

	// Verify that this client  actually owns the asset.
	if clientID != asset.Owner {
		return fmt.Errorf("a client from %s cannot sell an asset owned by %s", clientID, asset.Owner)
	}

	clientOrgID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return  fmt.Errorf("failed getting client's orgID: %v", err)
	}

	if clientOrgID != asset.OwnerOrg {
		return fmt.Errorf("submitting client not from the same Org.Clients org is %s and buyers is %s", clientOrgID, asset.OwnerOrg)
	}

	return SaveToCollection(ctx, assetID, typeAssetForSale)
}



// AgreeToBuy adds buyer's bid price to buyer's implicit private data collection
func (s *SmartContract) AgreeToBuy(ctx contractapi.TransactionContextInterface, assetID string) error {
	return SaveToCollection(ctx, assetID, typeAssetBid)
}

// SaveToCollection adds a bid or ask price,as a composite key to caller's implicit private data collection
func SaveToCollection(ctx contractapi.TransactionContextInterface, assetID string, priceType string) error {
	// In this scenario, client is only authorized to read/write private data from its own peer.
	err := verifyClientOrgMatchesPeerOrg(ctx)
	if err != nil {
		return fmt.Errorf("Could not be verified. : Error %v", err)
	}

	transMap, err := ctx.GetStub().GetTransient()
	if err != nil {
		return fmt.Errorf("error getting transient: %v", err)
	}

	// Asset price must be retrieved from the transient field as they are private
	price, ok := transMap["asset_price"]
	if !ok {
		return fmt.Errorf("asset_price key not found in the transient map")
	}

	collection ,err:= buildCollectionName(ctx)
	if err != nil {
		return fmt.Errorf("failed to infer private collection name for the org: %v", err)
	}
	// Persist the agreed to price in a collection sub-namespace based on priceType key prefix,
	// to avoid collisions between private asset properties, sell price, and buy price
	assetPriceKey, err := ctx.GetStub().CreateCompositeKey(priceType, []string{assetID})
	if err != nil {
		return fmt.Errorf("failed to create composite key: %v", err)
	}

	// The Price hash will be verified later, therefore always pass and persist price bytes as is,
	// so that there is no risk of nondeterministic marshaling.
	err = ctx.GetStub().PutPrivateData(collection, assetPriceKey, price)
	if err != nil {
		return fmt.Errorf("failed to put asset bid: %v", err)
	}

	return nil
}

//Puts Buy request on shared Private Collection
func (s *SmartContract) RequestToBuy(ctx contractapi.TransactionContextInterface,assetID string ) error {

	// Get ID of submitting client identity
	buyerID, err := s.GetSubmittingClientIdentity(ctx)
	if err != nil {
		return err
	}

	clientMSPID,err:=ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed getting the client's MSPID: %v", err)
	}

	// Create agreeement that indicates which identity has agreed to purchase
	// In a more realistic transfer scenario, a transfer agreement would be secured to ensure that it cannot
	// be overwritten by another channel member
	buyRequestKey, err := ctx.GetStub().CreateCompositeKey(requestToBuyObjectType, []string{assetID})
	if err != nil {
		return fmt.Errorf("failed to create composite key: %v", err)
	}
	temp:=assetCollection
	if clientMSPID =="Org3MSP"{
		temp=assetCollection23
	}

	//check if a request already exists,so users cant override requests
	exists, err := s.RequestToBuyExists(ctx, assetID,temp)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("A request for the asset %s already exists", assetID)
	}
	//I could change it to make it as function input
	err = ctx.GetStub().PutPrivateData(temp,buyRequestKey, []byte(buyerID))
	if err != nil {
		return fmt.Errorf("failed to put asset bid: %v", err)
	}
	log.Printf("Request To Buy : collection %v, ID %v, from %v", temp, assetID,clientMSPID)


	return nil
}

//Transfers asset , deletes price keys from sellers & buyers collections, deletes buyRequest from shared collection and creates Receipts for both orgs
func (s *SmartContract) TransferRequestedAsset(ctx contractapi.TransactionContextInterface) error {

	transientMap, err := ctx.GetStub().GetTransient()
	if err != nil {
		return fmt.Errorf("error getting transient %v", err)
	}

	// get Transient data , includes assetID and BuyerMSP
	transientTransferJSON, ok := transientMap["asset_owner"]
	if !ok {
		return fmt.Errorf("asset owner not found in the transient map")
	}

	type assetTransferTransientInput struct {
		ID       string `json:"assetID"`
		BuyerMSP string `json:"buyerMSP"`
	}

	var assetTransferInput assetTransferTransientInput
	err = json.Unmarshal(transientTransferJSON, &assetTransferInput)
	if err != nil {
		return fmt.Errorf("failed to unmarshal JSON: %v", err)
	}

	if len(assetTransferInput.ID) == 0 {
		return fmt.Errorf("assetID field must be a non-empty string")
	}
	if len(assetTransferInput.BuyerMSP) == 0 {
		return fmt.Errorf("buyerMSP field must be a non-empty string")
	}
	log.Printf("TransferAsset: verify asset exists ID %v", assetTransferInput.ID)
	// Read asset from world State
	asset, err := s.ReadAsset(ctx, assetTransferInput.ID)
	if err != nil {
		return fmt.Errorf("error reading asset: %v", err)
	}
	if asset == nil {
		return fmt.Errorf("%v does not exist", assetTransferInput.ID)
	}
	// Verify that the client is submitting request to peer in their organization
	err = verifyClientOrgMatchesPeerOrg(ctx)
	if err != nil {
		return fmt.Errorf("TransferAsset cannot be performed: Error %v", err)
	}

	// Verify transfer details and transfer owner
	err = s.verifyAgreement(ctx, asset.ID, asset.Owner,asset.OwnerOrg, assetTransferInput.BuyerMSP)
	if err != nil {
		return fmt.Errorf("failed transfer verification: %v", err)
	}
	//we have to chose the correct collection
	clientMSPID,err:=ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed getting the client's MSPID: %v", err)
	}
	//this might need to be changed so Org3 can sell to its clients or create another function
	temp:=assetCollection
	if clientMSPID =="Org2MSP"{
		temp=assetCollection23
	}
	buyRequest, err := s.ReadRequestToBuy(ctx, asset.ID,temp)
	if err != nil {
		return fmt.Errorf("failed ReadRequestToBuy to find buyerID: %v", err)
	}
	if buyRequest.BuyerID == "" {
		return fmt.Errorf("BuyerID not found in buyRequest for %v", asset.ID)
	}

	//change ownership
	asset.Owner = buyRequest.BuyerID
	asset.OwnerOrg = assetTransferInput.BuyerMSP
	assetJSONasBytes, err := json.Marshal(asset)
	if err != nil {
		return fmt.Errorf("failed marshalling asset %v: %v", asset.ID, err)
	}

	//rewrite the asset
	err = ctx.GetStub().PutState( asset.ID, assetJSONasBytes) 
	if err != nil {
		return err
	}

	// Get collection name for this organization
	collectionSeller, err := buildCollectionName(ctx)
	if err != nil {
		return fmt.Errorf("failed to infer private collection name for the org: %v", err)
	}


	// Delete the price records for seller
	assetPriceKey, err := ctx.GetStub().CreateCompositeKey(typeAssetForSale, []string{asset.ID})
	if err != nil {
		return fmt.Errorf("failed to create composite key for seller: %v", err)
	}
	 //price:=assetPriceKey.price

	//anyone can delete the data??? Probaby solved with access control
	err = ctx.GetStub().DelPrivateData(collectionSeller, assetPriceKey)
	if err != nil {
		return fmt.Errorf("failed to delete asset price from implicit private data collection for seller: %v", err)
	}



	return nil

}



/*============================HELPER FUNCTIONS=============================================*/


// verifyAgreement is an internal helper function used by TransferAsset to verify
// that the transfer is being initiated by the owner and that the buyer has agreed
// to the same appraisal value as the owner
func (s *SmartContract) verifyAgreement(ctx contractapi.TransactionContextInterface, assetID string, owner string,ownerOrg string, buyerMSP string) error {

	// Check 1: verify that the transfer is being initiatied by the owner

	// Get ID of submitting client identity
	clientID, err := s.GetSubmittingClientIdentity(ctx)
	if err != nil {
		return err
	}

	if clientID != owner {
		return fmt.Errorf("error: submitting client identity does not own asset")
	}

	//added this to avoid same name but different orgs
	clientOrgID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return  fmt.Errorf("failed getting client's orgID: %v", err)
	}

	if clientOrgID != ownerOrg {
		return fmt.Errorf("submitting client not from the same Org.Clients org is %s and buyers is %s",clientOrgID,ownerOrg)
	}



	// Check 2: verify that the buyer has agreed to the appraised value

	// Get collection names
	collectionSeller, err := buildCollectionName(ctx) // get owner collection from caller identity
	if err != nil {
		return fmt.Errorf("failed to infer private collection name for the org: %v", err)
	}

	collectionBuyer :="_implicit_org_"+ buyerMSP  // get buyers collection

	// Get sellers asking price
	assetForSaleKey, err := ctx.GetStub().CreateCompositeKey(typeAssetForSale, []string{assetID})
	if err != nil {
		return fmt.Errorf("failed to create composite key: %v", err)
	}
	sellerPriceHash, err := ctx.GetStub().GetPrivateDataHash(collectionSeller, assetForSaleKey)
	if err != nil {
		return fmt.Errorf("failed to get seller price hash: %v", err)
	}
	if sellerPriceHash == nil {
		return fmt.Errorf("seller price for %s does not exist", assetID)
	}

	// Get buyers bid price
	
	assetBidKey, err := ctx.GetStub().CreateCompositeKey(typeAssetBid, []string{assetID})
	if err != nil {
		return fmt.Errorf("failed to create composite key: %v", err)
	}
	buyerPriceHash, err := ctx.GetStub().GetPrivateDataHash(collectionBuyer, assetBidKey)
	if err != nil {
		return fmt.Errorf("failed to get buyer price hash: %v", err)
	}
	if buyerPriceHash == nil {
		return fmt.Errorf("buyer price for %s does not exist", assetID)
	}

	// Verify that the two hashes match
	if !bytes.Equal(sellerPriceHash,buyerPriceHash ) {
		return fmt.Errorf("hash for appraised value for owner %x does not value for seller %x", sellerPriceHash, buyerPriceHash)
	}

	return nil
}





// verifyClientOrgMatchesPeerOrg is an internal function used verify client org id and matches peer org id.
func verifyClientOrgMatchesPeerOrg(ctx contractapi.TransactionContextInterface) error {
	clientMSPID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed getting the client's MSPID: %v", err)
	}
	peerMSPID, err := shim.GetMSPID()
	if err != nil {
		return fmt.Errorf("failed getting the peer's MSPID: %v", err)
	}

	if clientMSPID != peerMSPID {
		return fmt.Errorf("client from org %v is not authorized to read or write private data from an org %v peer", clientMSPID, peerMSPID)
	}

	return nil
}

func buildCollectionName(ctx contractapi.TransactionContextInterface) (string, error) {
	// Get the MSP ID of submitting client identity
	clientMSPID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return "", fmt.Errorf("failed to get verified MSPID: %v", err)
	}
	return fmt.Sprintf("_implicit_org_%s", clientMSPID),err
}