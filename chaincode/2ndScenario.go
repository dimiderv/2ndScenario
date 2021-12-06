package chaincode

import (
  "encoding/json"
  "fmt"
  "log"
  "encoding/base64"
  "github.com/hyperledger/fabric-contract-api-go/contractapi"
  "time"
  "strings"
  "github.com/golang/protobuf/ptypes"
  //"github.com/hyperledger/fabric-chaincode-go/pkg/statebased"

  
)



// SmartContract provides functions for managing an Asset
type SmartContract struct {
  contractapi.Contract
}

// Asset describes basic details of what makes up a simple asset
type Asset struct {
	AssetType 	 string      	`json:"assetType"`
	ID             string  	 	`json:"ID"`
	Color          string 	 	`json:"color"`
	Weight         int       	`json:"weight"`
	Owner          string    	`json:"owner"`
	OwnerOrg       string    	`json:ownerOrg`
	Timestamp      time.Time 	`json:"timestamp"`
	Creator        string 	 	`json:"creator"`
	ExpirationDate time.Time 	`json:"expirationDate"`
	SensorData 	 string		 	`json:"sensorData"`
  
}



// InitLedger adds a base set of assets to the ledger
func (s *SmartContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	
	
	temp := ctx.GetClientIdentity().AssertAttributeValue("retailer", "true")
	if temp==nil {
		return fmt.Errorf("submitting client not authorized to create asset, he is a Retailer")
	}

	err := ctx.GetClientIdentity().AssertAttributeValue("farmer", "true")
	if err != nil {
		return fmt.Errorf("submitting client not authorized to create asset, he is not a Farmer")
	}
	
	
	timeS,err:= ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return  err
	}
	timestamp, err := ptypes.Timestamp(timeS)
	if err != nil {
		return err
	}
	clientID, err := s.GetSubmittingClientIdentity(ctx)
	if err != nil {
		return err
	}
	creatorDN, err:=s.GetSubmittingClientDN(ctx)
	if err != nil {
		return err
	}
	expirationDate := timestamp.AddDate(0,0,7)

	//in case a user from other org has the same name , cause they have different CAs that might happen
	clientOrgID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return  fmt.Errorf("failed getting client's orgID: %v", err)
	}


	assets := []Asset{
		{ID: "asset1", Color: "blue",   AssetType:"berries", Weight: 5,  Owner: clientID, OwnerOrg:clientOrgID,Timestamp: timestamp,Creator: creatorDN,SensorData:"",ExpirationDate:expirationDate},
		{ID: "asset2", Color: "black",  AssetType:"berries", Weight: 5,  Owner: clientID, OwnerOrg:clientOrgID,Timestamp: timestamp,Creator: creatorDN,SensorData:"",ExpirationDate:expirationDate},
		{ID: "asset3", Color: "green",  AssetType:"apples",  Weight: 10, Owner: clientID, OwnerOrg:clientOrgID,Timestamp: timestamp,Creator: creatorDN,SensorData:"",ExpirationDate:expirationDate},
		{ID: "asset4", Color: "yellow", AssetType:"apples",  Weight: 10, Owner: clientID, OwnerOrg:clientOrgID,Timestamp: timestamp,Creator: creatorDN,SensorData:"",ExpirationDate:expirationDate},
		{ID: "asset5", Color: "red",    AssetType:"apples",  Weight: 15, Owner: clientID, OwnerOrg:clientOrgID,Timestamp: timestamp,Creator: creatorDN,SensorData:"",ExpirationDate:expirationDate},
		{ID: "asset6", Color: "white",  AssetType:"grapes",  Weight: 15, Owner: clientID, OwnerOrg:clientOrgID,Timestamp: timestamp,Creator: creatorDN,SensorData:"",ExpirationDate:expirationDate},
	  }
  for _, asset := range assets {
    assetJSON, err := json.Marshal(asset)
    if err != nil {
      return err
    }

    err = ctx.GetStub().PutState(asset.ID, assetJSON)
    if err != nil {
      return fmt.Errorf("failed to put to world state. %v", err)
    }
  }

  return nil
}

// CreateAsset issues a new asset to the world state with given details and adds price to shared collection.
func (s *SmartContract) CreateAsset(ctx contractapi.TransactionContextInterface, id string, color string, weight int,assetType string) error {
//objectType strings,

	//check if asset already exists
	exists, err := s.AssetExists(ctx, id)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("the asset %s already exists", id)
	}
	//get clientOrgID only client with Org1MSP can create assets
	clientOrgID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return  fmt.Errorf("failed getting client's orgID: %v", err)
	}
	if clientOrgID != "Org1MSP"{
		return fmt.Errorf("submitting client not authorized to create asset, not a member of Org1")
	}

	//Access Control only farmers can createAssets
	temp := ctx.GetClientIdentity().AssertAttributeValue("retailer", "true")
	if temp==nil {
		return fmt.Errorf("submitting client not authorized to create asset, he is a Retailer")
	}

	farmer := ctx.GetClientIdentity().AssertAttributeValue("farmer", "true")
	if farmer != nil {
		return fmt.Errorf("submitting client not authorized to create asset, he is not a Farmer")
	}

		

	// Get ID of submitting client identity
	clientID, err := s.GetSubmittingClientIdentity(ctx)
	if err != nil {
		return err
	}

	creatorDN, err:=s.GetSubmittingClientDN(ctx)
	if err != nil {
		return err
	}

	//Get timestamp 	
	txTimestamp, error := ctx.GetStub().GetTxTimestamp()
	if error != nil {
		return  error
	}
	timestamp, erri := ptypes.Timestamp(txTimestamp)
	if erri != nil {
		return  erri
	}
	//add expiration date
	expirationDate := timestamp.AddDate(0,0,7)


	// Verify that the client is submitting request to peer in their organization
	// This is to ensure that a client from another org doesn't attempt to read or
	// write private data from this peer.
	err = verifyClientOrgMatchesPeerOrg(ctx)
	if err != nil {
		return fmt.Errorf("CreateAsset cannot be performed: Error %v", err)
	}

	// Make submitting client the owner
	asset := Asset{
		AssetType:		assetType,
		ID:    			id,
		Color: 			color,
		Weight:  		weight,
		Owner: 			clientID,
		OwnerOrg:		clientOrgID,
		Timestamp:  	timestamp,
		Creator: 		creatorDN,
		ExpirationDate:	expirationDate,
		SensorData: 	""}

	assetJSONasBytes, err := json.Marshal(asset)
	if err != nil {
		return fmt.Errorf("failed to marshal asset into JSON: %v", err)
	}



	err = ctx.GetStub().PutState(id, assetJSONasBytes)//puts data in public
	if err != nil {
		return fmt.Errorf("failed to put asset into private data collecton: %v", err)
	}

	return nil

}

// UpdateAsset updates an existing asset in the world state with provided parameters.
func (s *SmartContract) UpdateAsset(ctx contractapi.TransactionContextInterface, id string, newColor string, newWeight int) error {

	asset, err := s.ReadAsset(ctx, id)
	if err != nil {
		return err
	}

	clientOrgID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return  fmt.Errorf("failed getting client's orgID: %v", err)
	}
	
	clientID, err := s.GetSubmittingClientIdentity(ctx)
	if err != nil {
		return err
	}

	if clientID != asset.Owner {
		return fmt.Errorf("submitting client not authorized to update asset, does not own asset")
	}

	if clientOrgID != asset.OwnerOrg {
		return fmt.Errorf("submitting client not authorized to update asset, not from the same Org")
	}
	asset.Color = newColor
	asset.Weight = newWeight


	assetJSON, err := json.Marshal(asset)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(id, assetJSON)
}

// DeleteAsset deletes a given asset from the world state.
func (s *SmartContract) DeleteAsset(ctx contractapi.TransactionContextInterface, id string) error {

	asset, err := s.ReadAsset(ctx, id)
	if err != nil {
		return err
	}

	clientID, err := s.GetSubmittingClientIdentity(ctx)
	if err != nil {
		return err
	}

	if clientID != asset.Owner {
		return fmt.Errorf("submitting client not authorized to update asset, does not own asset")
	}

	clientOrgID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return  fmt.Errorf("failed getting client's orgID: %v", err)
	}

	if clientOrgID != asset.OwnerOrg {
		return fmt.Errorf("submitting client not authorized to update asset, not from the same Org")
	}

	return ctx.GetStub().DelState(id)
}

//Delete Buy Request
func (s *SmartContract) DeleteBuyRequest(ctx contractapi.TransactionContextInterface, id string, sharedCollection string) error {
	//temp:=assetCollection
	request, err := s.ReadRequestToBuy(ctx, id,sharedCollection)
	if err != nil {
		return err
	}

	clientID, err := s.GetSubmittingClientIdentity(ctx)
	if err != nil {
		return err
	}

	if clientID != request.BuyerID {
		return fmt.Errorf("submitting client not authorized to delete buy request , does not own asset")
	}
	requestToBuyKey, err := ctx.GetStub().CreateCompositeKey(requestToBuyObjectType, []string{id})
	if err != nil {
		return fmt.Errorf("failed to create composite key: %v", err)
	}
	// clientOrgID, err := ctx.GetClientIdentity().GetMSPID()
	// if err != nil {
	// 	return  fmt.Errorf("failed getting client's orgID: %v", err)
	// }
	// if clientOrgID =="Org3MSP"{
	// 	temp=assetCollection23
	// }
	log.Printf("DeleteBuy Request : collection %v, ID %v,", sharedCollection, id)
	return ctx.GetStub().DelPrivateData(sharedCollection,requestToBuyKey)
}




// AssetExists returns true when asset with given ID exists in world state
func (s *SmartContract) AssetExists(ctx contractapi.TransactionContextInterface, id string) (bool, error) {

	assetJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return false, fmt.Errorf("failed to read from world state: %v", err)
	}

	return assetJSON != nil, nil
}


/*=========================================HELPER FUNCTIONS=======================================*/



// GetSubmittingClientIdentity returns the name and issuer of the identity that
// invokes the smart contract. This function base64 decodes the identity string
// before returning the value to the client or smart contract.
//files is located at pkg/cid/cid.go for GetID() on sourcegraph.com
//returns x509::CN=FarmerO,OU=org1+OU=client+OU=department1::CN=ca.org1.example.com,O=org1.example.com,L=Durham,ST=North Carolina,C=US
//on GetId() => ("x509::%s::%s", getDN(&c.cert.Subject), getDN(&c.cert.Issuer)
//DN is distinguished name as defined by RFC 2253
/* https://sourcegraph.com/github.com/hyperledger/fabric-chaincode-go@38d29fabecb9916a8a1ecbd0facb72f2ac32d016/-/blob/pkg/cid/cid.go?L76 */
func (s *SmartContract) GetSubmittingClientIdentity(ctx contractapi.TransactionContextInterface) (string, error) {

	b64ID, err := ctx.GetClientIdentity().GetID()
	if err != nil {
		return "", fmt.Errorf("Failed to read clientID: %v", err)
	}
	decodeID, err := base64.StdEncoding.DecodeString(b64ID)
	if err != nil {
		return "", fmt.Errorf("failed to base64 decode clientID: %v", err)
	}
	clientName:=_between(string(decodeID),"x509::CN=",",")
	return  clientName, nil
}


//GetSubmittingClientDN returns the Distinguished Name as defined by RFC 2253
func (s *SmartContract) GetSubmittingClientDN(ctx contractapi.TransactionContextInterface) (string, error) {

	b64ID, err := ctx.GetClientIdentity().GetID()
	if err != nil {
		return "", fmt.Errorf("Failed to read clientID: %v", err)
	}
	decodeID, err := base64.StdEncoding.DecodeString(b64ID)
	if err != nil {
		return "", fmt.Errorf("failed to base64 decode clientID: %v", err)
	}
	
	return string(decodeID) , nil
}

//Function to get string between two strings.
func _between(value string, a string, b string) string {
    // Get substring between two strings.
    posFirst := strings.Index(value, a)
    if posFirst == -1 {
        return ""
    }
    posLast := strings.Index(value, b)
    if posLast == -1 {
        return ""
    }
    posFirstAdjusted := posFirst + len(a)
    if posFirstAdjusted >= posLast {
        return ""
    }
    return value[posFirstAdjusted:posLast]
}


//main function that starts the chaincode
func main() {
  assetChaincode, err := contractapi.NewChaincode(&SmartContract{})
  if err != nil {
    log.Panicf("Error creating asset-transfer-basic chaincode: %v", err)
  }

  if err := assetChaincode.Start(); err != nil {
    log.Panicf("Error starting asset-transfer-basic chaincode: %v", err)
  }
}
