## Intro

Connext is the protocol for p2p micropayments, which is one of the most famous state channel solution in Ethereum. You can learn more about Connext in here: https://github.com/connext/indra

Recently,  [The Graph](https://thegraph.com/) announced that they are bringing generalized state channels to Ethereum mainnet, through a collaboration with [Connext](https://connext.network/). See here: https://thegraph.com/blog/the-graph-brings-state-channels-to-ethereum

So I'm trying to use Connext to integrate TBTC and KEEP into the layer2, then user can send and received TBTC with state channel. I implemented this function based on Dai Card, a state channel product developed by Connext. Since Dai Card only supports ETH and does not support any ERC20 token, I have made many changes to the Dai Card. The detailed process of my change is written below.

Here is the Dai Card which changed by me: http://34.92.241.132:3001/. I have encountered some unknown obstacles, so the transfer function has not been fully implemented so far. I still working on it!

![tbtc_daicard](docs/img/tbtc_daicard.png)

## Deploy Indra for Ethereum Ropsten network

### Clone Repository

First clone the repository to the server directory

`git clone https://github.com/connext/indra.git`

### Create an environment variable file

Create `dev.env` as follow:

Add the address of the erc20 token you want to support to `INDRA_SUPPORTED_TOKENS`.

Notice the PROVIDERS, you need to have an available provider API ready in advance. Creating a channel contract requires a mnemonic to be added to the environment variable  `INDRA_MNEMONIC` and an Eth to be sent to the corresponding address.

```
export INDRA_ADMIN_TOKEN="cxt1234"

export INDRA_CHAIN_PROVIDERS='{"3":"[https://ropsten.infura.io/v3/YOUR](https://ropsten.infura.io/v3/YOUR)”_PROJECT_ID}’

export INDRA_SUPPORTED_TOKENS='{"3":["0x343d3DDA00415289CDD4E8030F63a4A5a2548ff9", "0x7c07C42973047223F80C4A69Bb62D5195460Eb5F", "0xDca358a0a0bB01C6ae5306B169c62C77Ffd0c48f"]}'

export INDRA_MNEMONIC=“YOUR MNEMONIC”

export INDRA_NATS_JWT_SIGNER_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----MIIEowIBAAKCAQEAqU/GXp8MqmugQyRk5FUFBvlJt1/h7L3Crzlzejz/OxriZdq/lBNQW9S1kzGc7qjXprZ1Kg3zP6irr6wmvP0WYBGltWs2cWUAmxh0PSxuKdT/OyL9w+rjKLh4yo3ex6

DX3Ij0iP01Ej2POe5WrPDS8j6LT0s4HZ1FprL5h7RUQWV3cO4pF+1kl6HlBpNzEQzocW9ig4DNdSeUENARHWoCixE1gFYo9RXm7acqgqCk3ihdJRIbO4e/m1aZq2mvAFK+yHTIWBL0p5PF0Fe8zcWdNeEATYB+eRdNJ3jjS8447YrcbQcBQmhFjk8hbCnc3Rv3HvAapk8xDFhImdVF1ffDF

wIDAQABAoIBAGZIs2ZmX5h0/JSTYAAw/KCB6W7Glg4XdY21/3VRdD+Ytj0iMaqbIGjZz/fkeRIVHnKwt4d4dgN3OoEeVyjFHMdc4eb/phxLEFqiI1bxiHvtGWP4d6XsON9Y0mBL5NJk8QNiGZjIn08tsWEmA2bm9gkyj6aPoo8BfBqA9Q5uepgmYIPT2NtEXvTbd2dedAEJDJspHKHqBfcu

NBVoVhUixVSgehWGGP4GX+FvAEHbawDrwULkMvgblH+X8nBtzikp29LNpOZSRRbqF/Da0AkluFvuDUUIzitjZs5koSEAteaulkZO08BMxtovQjh/ZPtVZKZ27POCNOgRsbm/lVIXRMECgYEA2TQQ2Xy6eO5XfbiT4ZD1Z1xe9B6Ti7J2fC0ZNNSXs4DzdYVcHNIuZqfK6fGqmByvSnFut7n

5Po0z2FdXc7xcKFJdBZdFP3GLXbN9vpRPIk9b6n+0df471uTYwVocmAGXez++y73j5XzHQQW4WmmC5SlKjQUWCGkuzISVjRDtlZ0CgYEAx43KPrJxSijjE2+VWYjNFVuv6KilnWoA8I2cZ7TtPi4h//r5vyOUst0egR3lJ7rBof74VttQPvqAk3GN697IrE/bSwefwG2lM1Ta0KB3jn6b/i

T4ckmaOB+v6aDHq/GPW6l/sxD0RIEelRYZlsNLepRgKhcQckhjnWzQuGWSl0MCgYBYJQ0BdeCm2vKejp1U2OL+Qzo1j4MJGi+DTToBepTlv9sNQkWTXKh/+HAcaHp2qI1qhIYOAWbov5zemvNegH5Vzrb5Yd40VPvd1s2c3csPfW0ryQ+PItFd8BkWvl8EQQEcf04KmNE3fF/QP2YFKvR30

z3x5LKAT08yqEuYp9oC8QKBgQCfc9XqGU3bEya3Lg8ptt0gtt2ty6xiRwSvMoiKeZCkgdpbH6EWMQktjvBD/a5Q+7KjjgfD54SMfj/lEPR1R9QTk8/HeTUWXsaFaMVbtQ0zSEm/Xq1DLTrUo8U9qmJCK0gA10SZwe9dGctlF36k8DJMpWjd2QYkO2GVthBld4wV3wKBgC7S4q0wmcrQIjyD

IFmISQNdOAJhR0pJXG8mK2jECbEXxbKkAJnLj73DJ+1OVBlx4HXx54PiEkV3M3iTinf5tBSi8nA2D3s829F65XKFli1RC4rJv+2ygH8PnXX9rQKhK/v6/jeelKquH8zy894hLZe7feSsWV9GMgb5l9p+UzWB-----END RSA PRIVATE KEY-----"

export INDRA_NATS_JWT_SIGNER_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqU/GXp8MqmugQyRk5FUFBvlJt1/h7L3Crzlzejz/OxriZdq/lBNQW9S1kzGc7qjXprZ1Kg3zP6irr6wmvP0WYBGltWs2cWUAmxh0PSxu

KdT/OyL9w+rjKLh4yo3ex6DX3Ij0iP01Ej2POe5WrPDS8j6LT0s4HZ1FprL5h7RUQWV3cO4pF+1kl6HlBpNzEQzocW9ig4DNdSeUENARHWoCixE1gFYo9RXm7acqgqCk3ihdJRIbO4e/m1aZq2mvAFK+yHTIWBL0p5PF0Fe8zcWdNeEATYB+eRdNJ3jjS8447YrcbQcBQmhFjk8hbCnc3Rv

3HvAapk8xDFhImdVF1ffDFwIDAQAB-----END PUBLIC KEY-----"
```


### Docker secret

The mnemonic for creating a channel contract is a Docker secret in Docker deployment. The original script has a little bug, so you should change the `opts/start-indra.sh` as follow:

```
--- a/ops/[start-indra.sh](http://start-indra.sh)

+++ b/ops/[start-indra.sh](http://start-indra.sh)

@@ -326,7 +326,8 @@ secrets:

$db_secret:

external: true

$mnemonic_secret_name:

-  external: truecat

+  file: ./indra_mnemonic

+  #external: true
```

At the same time, you need to create a file `indra_mnemonic` in the root directory, which is the mnemonic.

### Deploy contract

The order to deploy the contract is as follows:

```
make contracts

bash ops/[deploy-contracts.sh](http://deploy-contracts.sh)[https://ropsten.infura.io/v3/YOUR_PROJECT_ID](https://ropsten.infura.io/v3/YOUR_PROJECT_ID)
```

Mainly using the Infua interface, the Alchemyapi will error. The contract address can be found at  `modules/contracts/address-book.json` . This step generates a fixed contract address for each set of Mnemonics, which remains the same after deployment. There is no need to redeploy the contract to support the new ERC20.

### Start and stop node

```
make start

make stop
```

### Start Dai Card

To start Dai Card, you also need to create `.env`, which reads:

```
SKIP_PREFLIGHT_CHECK=true

REACT_APP_DEV=true

REACT_APP_ETH_URL_OVERRIDE="[https://eth-ropsten.alchemyapi.io/v2/YOUR_PROJECT_ID](https://eth-ropsten.alchemyapi.io/v2/YOUR_PROJECT_ID)”
```

Activate Command:   `make start-daicard`
